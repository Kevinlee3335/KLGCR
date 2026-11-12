"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

type AppNotification = {
  id: string;
  type?: string;
  title: string;
  body: string;
  href: string;
  created_at: string;
  read_at: string | null;
};

type NotificationSnapshot = {
  owner: string | null;
  items: AppNotification[];
  isBrowser: boolean;
  permission: NotificationPermission | "unsupported";
  phoneAlerts: "checking" | "active" | "inactive";
};

type NotificationChange = (items: AppNotification[]) => AppNotification[];

export const emptyNotifications: NotificationSnapshot = {
  owner: null, items: [], isBrowser: false, permission: "unsupported", phoneAlerts: "checking",
};

let lastPushSave: { userId: string; endpoint: string; at: number } | null = null;

function browserPermission() {
  return "Notification" in window ? Notification.permission : "unsupported";
}

async function getPhoneAlertRegistration() {
  const serviceWorker = navigator.serviceWorker;
  const existing = await serviceWorker.getRegistration("/");
  const worker = existing?.installing ?? existing?.waiting ?? existing?.active;
  if (existing && worker?.scriptURL === new URL("/sw.js", window.location.origin).href) return existing;
  return serviceWorker.register("/sw.js");
}

async function getPhoneSubscription(registration: ServiceWorkerRegistration) {
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  const response = await fetch("/api/push/subscribe", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !data.publicKey) throw new Error(data.error || "Push notifications are not ready yet.");
  const value: string = data.publicKey;
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = window.atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const applicationServerKey = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
}

async function savePhoneSubscription(userId: string, subscription: PushSubscription) {
  const response = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Unable to save phone alerts.");
  }
  lastPushSave = { userId, endpoint: subscription.endpoint, at: Date.now() };
}

export function useNotificationSession(userId: string | null) {
  const [snapshot, setSnapshot] = useState(emptyNotifications);
  const currentUser = useRef<string | null>(null);
  const pendingLoad = useRef<{ owner: string; changes: NotificationChange[] } | null>(null);
  const updateItems = useCallback((owner: string, change: NotificationChange) => {
    const load = pendingLoad.current;
    if (load?.owner === owner) load.changes.push(change);
    setSnapshot((current) => current.owner === owner ? { ...current, items: change(current.items) } : current);
  }, []);

  useEffect(() => {
    if (!userId) return;
    currentUser.current = userId;
    setSnapshot({ ...emptyNotifications, owner: userId, isBrowser: true, permission: browserPermission() });
    const supabase = createClient();
    let active = true;
    const update = (change: (current: NotificationSnapshot) => NotificationSnapshot) => {
      if (active) setSnapshot((current) => current.owner === userId ? change(current) : current);
    };
    const load = async () => {
      if (pendingLoad.current?.owner === userId) return;
      const request = { owner: userId, changes: [] as NotificationChange[] };
      pendingLoad.current = request;
      try {
        const { data } = await supabase.from("app_notifications")
          .select("id,title,body,href,created_at,read_at")
          .eq("recipient_id", userId).order("created_at", { ascending: false }).limit(30);
        if (data && active) {
          const items = request.changes.reduce((items, change) => change(items), data as AppNotification[]);
          update((current) => ({ ...current, items }));
        }
      } catch {
        // Keep the current list if the network drops during a refresh.
      } finally {
        if (pendingLoad.current === request) pendingLoad.current = null;
      }
    };
    void load();

    let restoring = false;
    const restorePhoneAlerts = async () => {
      if (restoring) return;
      if (!("serviceWorker" in navigator)) {
        update((current) => ({ ...current, phoneAlerts: "inactive" }));
        return;
      }
      restoring = true;
      try {
        const registration = await getPhoneAlertRegistration();
        if (!active) return;
        if (browserPermission() !== "granted") {
          update((current) => ({ ...current, phoneAlerts: "inactive" }));
          return;
        }
        const subscription = await getPhoneSubscription(registration);
        if (!active) return;
        if (!lastPushSave || lastPushSave.userId !== userId || lastPushSave.endpoint !== subscription.endpoint || Date.now() - lastPushSave.at > 60_000) {
          await savePhoneSubscription(userId, subscription);
        }
        update((current) => ({ ...current, phoneAlerts: "active" }));
      } catch {
        update((current) => ({ ...current, phoneAlerts: "inactive" }));
      } finally {
        restoring = false;
      }
    };
    void restorePhoneAlerts();
    const refresh = () => {
      if (document.visibilityState === "visible") {
        update((current) => ({ ...current, permission: browserPermission() }));
        void load();
        void restorePhoneAlerts();
      }
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    let hasSubscribed = false;
    const channel = supabase.channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "app_notifications", filter: `recipient_id=eq.${userId}` }, (event) => {
        if (!active) return;
        const item = event.new as AppNotification;
        updateItems(userId, (items) => items.some((entry) => entry.id === item.id) ? items : [item, ...items].slice(0, 30));
        if ("serviceWorker" in navigator && browserPermission() === "granted") {
          void navigator.serviceWorker.ready.then((registration) => {
            if (!active || browserPermission() !== "granted") return;
            return registration.showNotification(item.title, {
              tag: item.type === "compliance_expiry" ? `compliance-expiry-${item.id}` :
                item.href.startsWith("/admin/document-review/") ||
                  (item.href.startsWith("/admin/cert-servicing/records/") &&
                    (item.type === "document_verification" || item.type === "document_approval_requested"))
                  ? `document-review-${item.id}` : undefined,
              body: item.body, icon: "/klg-campus-residence-logo.png", badge: "/klg-campus-residence-logo.png", data: { href: item.href },
            });
          }).catch(() => {});
        }
      }).subscribe((status) => {
        if (!active || status !== "SUBSCRIBED") return;
        if (hasSubscribed) void load();
        hasSubscribed = true;
      });
    return () => {
      active = false;
      currentUser.current = null;
      if (pendingLoad.current?.owner === userId) pendingLoad.current = null;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      void supabase.removeChannel(channel);
    };
  }, [updateItems, userId]);

  async function enablePhoneAlerts() {
    if (!userId || currentUser.current !== userId) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) throw new Error("This browser does not support phone alerts.");
    const update = (patch: Partial<NotificationSnapshot>) => {
      setSnapshot((current) => current.owner === userId ? { ...current, ...patch } : current);
    };
    update({ phoneAlerts: "checking" });
    try {
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (currentUser.current !== userId) return;
      update({ permission });
      if (permission !== "granted") throw new Error("Notification permission was not allowed.");
      const registration = await getPhoneAlertRegistration();
      if (currentUser.current !== userId) return;
      const subscription = await getPhoneSubscription(registration);
      if (currentUser.current !== userId) return;
      await savePhoneSubscription(userId, subscription);
      if (currentUser.current !== userId) return;
      update({ phoneAlerts: "active" });
      void registration.showNotification("KLGCR phone alerts enabled", { body: "You will receive new KLGCR notifications even when the app is closed.", icon: "/klg-campus-residence-logo.png" }).catch(() => {});
    } catch (error) {
      update({ phoneAlerts: "inactive" });
      throw error;
    }
  }

  async function markRead(ids: string[]) {
    if (!userId || currentUser.current !== userId) return;
    const supabase = createClient();
    const readAt = new Date().toISOString();
    const { error } = await supabase.from("app_notifications").update({ read_at: readAt }).in("id", ids).eq("recipient_id", userId);
    if (error) throw error;
    const savedIds = new Set(ids);
    updateItems(userId, (items) => items.map((item) => savedIds.has(item.id) ? { ...item, read_at: readAt } : item));
  }

  return { snapshot, enablePhoneAlerts, markRead };
}

export type NotificationSession = ReturnType<typeof useNotificationSession>;

const DashboardNotificationContext = createContext<{
  activate: (userId: string) => void;
  session: NotificationSession;
} | null>(null);

export function DashboardNotificationSession({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const session = useNotificationSession(userId);
  return <DashboardNotificationContext.Provider value={{ activate: setUserId, session }}>{children}</DashboardNotificationContext.Provider>;
}

export function useDashboardNotifications(userId: string) {
  const context = useContext(DashboardNotificationContext);
  const activate = context?.activate;
  useEffect(() => { activate?.(userId); }, [activate, userId]);
  return context?.session ?? null;
}
