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

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}

export function NotificationBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const unread = useMemo(() => items.filter((item) => !item.read_at).length, [items]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const load = async () => {
      const { data } = await supabase.from("app_notifications")
        .select("id,title,body,href,created_at,read_at")
        .eq("recipient_id", userId).order("created_at", { ascending: false }).limit(30);
      if (active && data) setItems(data);
    };
    void load();

    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    const channel = supabase.channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "app_notifications", filter: `recipient_id=eq.${userId}` }, (event) => {
        const item = event.new as AppNotification;
        if (!active) return;
        setItems((current) => [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 30));
        if (Notification.permission === "granted") {
          void navigator.serviceWorker.ready.then((registration) => registration.showNotification(item.title, {
            body: item.body, icon: "/klg-campus-residence-logo.png", badge: "/klg-campus-residence-logo.png", data: { href: item.href },
          }));
        }
      }).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [userId]);

  async function enablePhoneAlerts() {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("KLGCR notifications enabled", { body: "You will see new alerts while the system is open.", icon: "/klg-campus-residence-logo.png" });
    }
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
      {"Notification" in window && Notification.permission !== "granted" && <button type="button" className="app-notification-enable" onClick={() => void enablePhoneAlerts()}>Enable phone alerts</button>}
    </div>}
  </div>;
}
