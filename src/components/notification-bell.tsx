"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AppNotification = {
  id: string;
  title: string;
  body: string;
  href: string;
  created_at: string;
  read_at: string | null;
};

// AppShell can mount again during navigation. A recent save for the same
// account and browser subscription does not need another server request.
let lastPushSave: { userId: string; endpoint: string; at: number } | null = null;

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}

async function savePhoneSubscription(subscription: PushSubscription) {
  const response = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Unable to save phone alerts.");
  }
}

export function NotificationBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [enableError, setEnableError] = useState("");
  const [isBrowser, setIsBrowser] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [phoneAlerts, setPhoneAlerts] = useState<"checking" | "active" | "inactive">("checking");
  const unread = useMemo(() => items.filter((item) => !item.read_at).length, [items]);

  useEffect(() => {
    setIsBrowser(true);
    setNotificationPermission("Notification" in window ? Notification.permission : "unsupported");
    const supabase = createClient();
    let active = true;
    const load = async () => {
      const { data } = await supabase.from("app_notifications")
        .select("id,title,body,href,created_at,read_at")
        .eq("recipient_id", userId).order("created_at", { ascending: false }).limit(30);
      if (active && data) setItems(data);
    };
    void load();

    // Permission and subscriptions belong to this browser, but the server-side
    // subscription must be attached to the account that just signed in.
    const restorePhoneAlerts = async () => {
      if (!("serviceWorker" in navigator)) {
        if (active) setPhoneAlerts("inactive");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        if (!("Notification" in window) || Notification.permission !== "granted") {
          if (active) setPhoneAlerts("inactive");
          return;
        }
        const subscription = await registration.pushManager.getSubscription();
        if (subscription && (!lastPushSave || lastPushSave.userId !== userId || lastPushSave.endpoint !== subscription.endpoint || Date.now() - lastPushSave.at > 60_000)) {
          await savePhoneSubscription(subscription);
          lastPushSave = { userId, endpoint: subscription.endpoint, at: Date.now() };
        }
        if (active) setPhoneAlerts(subscription ? "active" : "inactive");
      } catch {
        if (active) setPhoneAlerts("inactive");
      }
    };
    setPhoneAlerts("checking");
    void restorePhoneAlerts();
    const channel = supabase.channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "app_notifications", filter: `recipient_id=eq.${userId}` }, (event) => {
        const item = event.new as AppNotification;
        if (!active) return;
        setItems((current) => [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 30));
        if ("Notification" in window && Notification.permission === "granted") {
          void navigator.serviceWorker.ready.then((registration) => registration.showNotification(item.title, {
            body: item.body, icon: "/klg-campus-residence-logo.png", badge: "/klg-campus-residence-logo.png", data: { href: item.href },
          }));
        }
      }).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [userId]);

  async function enablePhoneAlerts() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) { setEnableError("This browser does not support phone alerts."); return; }
    setPhoneAlerts("checking");
    setEnableError("");
    try {
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== "granted") { setEnableError("Notification permission was not allowed."); setPhoneAlerts("inactive"); return; }
      const registration = await navigator.serviceWorker.register("/sw.js");
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const keyResponse = await fetch("/api/push/subscribe", { cache: "no-store" });
        const keyData = await keyResponse.json();
        if (!keyResponse.ok || !keyData.publicKey) throw new Error(keyData.error || "Push notifications are not ready yet.");
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(keyData.publicKey) });
      }
      await savePhoneSubscription(subscription);
      lastPushSave = { userId, endpoint: subscription.endpoint, at: Date.now() };
      setPhoneAlerts("active");
      void registration.showNotification("KLGCR phone alerts enabled", { body: "You will receive new KLGCR notifications even when the app is closed.", icon: "/klg-campus-residence-logo.png" }).catch(() => {});
    } catch (error) {
      setPhoneAlerts("inactive");
      setEnableError(error instanceof Error ? error.message : "Unable to set up phone alerts.");
    }
  }

  function urlBase64ToUint8Array(value: string) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(base64);
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
  }

  async function markAllRead() {
    const ids = items.filter((item) => !item.read_at).map((item) => item.id);
    if (!ids.length) return;
    const supabase = createClient();
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => ids.includes(item.id) ? { ...item, read_at: readAt } : item));
    await supabase.from("app_notifications").update({ read_at: readAt }).in("id", ids).eq("recipient_id", userId);
  }

  return <div className="app-notification-wrap">
    <button type="button" className="app-notification-button" onClick={() => setOpen((value) => !value)} aria-label="Open notifications" aria-expanded={open}>
      <Bell size={19}/>{unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}
    </button>
    {open && <div className="app-notification-panel">
      <div className="app-notification-head"><strong>Notifications</strong><button type="button" onClick={() => void markAllRead()} disabled={!unread}><CheckCheck size={16}/> Mark all read</button></div>
      {items.length === 0 ? <p className="app-notification-empty">No notifications yet.</p> : <div className="app-notification-list">{items.map((item) => <Link key={item.id} href={item.href} className={!item.read_at ? "unread" : ""} onClick={() => setOpen(false)}><strong>{item.title}</strong><span>{item.body}</span><small>{formatTime(item.created_at)}</small></Link>)}</div>}
      {isBrowser && notificationPermission !== "unsupported" && phoneAlerts === "active" && <p className="app-notification-empty" role="status">Phone alerts active on this device.</p>}
      {isBrowser && notificationPermission !== "unsupported" && phoneAlerts !== "active" && <button type="button" className="app-notification-enable" disabled={phoneAlerts === "checking"} onClick={() => void enablePhoneAlerts()}>{phoneAlerts === "checking" ? "Checking phone alerts…" : notificationPermission === "granted" ? "Set up phone alerts" : "Enable phone alerts"}</button>}
      {isBrowser && notificationPermission === "unsupported" && <p className="app-notification-error">Phone alerts require the KLGCR app to be added to your Home Screen.</p>}
      {enableError && <p className="app-notification-error">{enableError}</p>}
    </div>}
  </div>;
}
