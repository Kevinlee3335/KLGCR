"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import { emptyNotifications, useDashboardNotifications, useNotificationSession, type NotificationSession } from "./notification-session";

const notificationTime = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
});

export function NotificationBell({ userId }: { userId: string }) {
  const session = useDashboardNotifications(userId);
  return session
    ? <NotificationBellView key={userId} session={session} userId={userId}/>
    : <StandaloneNotificationBell key={userId} userId={userId}/>;
}

function StandaloneNotificationBell({ userId }: { userId: string }) {
  const session = useNotificationSession(userId);
  return <NotificationBellView session={session} userId={userId}/>;
}

function NotificationBellView({ session, userId }: { session: NotificationSession; userId: string }) {
  const [open, setOpen] = useState(false);
  const [enableError, setEnableError] = useState("");
  const [readError, setReadError] = useState("");
  const [markingRead, setMarkingRead] = useState(false);
  const { items, isBrowser, permission: notificationPermission, phoneAlerts } =
    session.snapshot.owner === userId ? session.snapshot : emptyNotifications;
  const unread = items.filter((item) => !item.read_at).length;

  async function enablePhoneAlerts() {
    setEnableError("");
    try {
      await session.enablePhoneAlerts();
    } catch (error) {
      setEnableError(error instanceof Error ? error.message : "Unable to set up phone alerts.");
    }
  }

  async function markAllRead() {
    const ids = items.filter((item) => !item.read_at).map((item) => item.id);
    if (!ids.length || markingRead) return;
    setMarkingRead(true);
    setReadError("");
    try {
      await session.markRead(ids);
    } catch {
      setReadError("Unable to mark notifications as read. Please try again.");
    } finally {
      setMarkingRead(false);
    }
  }

  return <div className="app-notification-wrap">
    <button type="button" className="app-notification-button" onClick={() => setOpen((value) => !value)} aria-label="Open notifications" aria-expanded={open}>
      <Bell size={19}/>{unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}
    </button>
    {open && <div className="app-notification-panel">
      <div className="app-notification-head"><strong>Notifications</strong><button type="button" onClick={() => void markAllRead()} disabled={!unread || markingRead}><CheckCheck size={16}/> Mark all read</button></div>
      {readError && <p className="app-notification-error" role="alert">{readError}</p>}
      {items.length === 0 ? <p className="app-notification-empty">No notifications yet.</p> : <div className="app-notification-list">{items.map((item) => <Link key={item.id} href={item.href} className={!item.read_at ? "unread" : ""} onClick={() => setOpen(false)}><strong>{item.title}</strong><span>{item.body}</span><small>{notificationTime.format(new Date(item.created_at))}</small></Link>)}</div>}
      {isBrowser && notificationPermission !== "unsupported" && phoneAlerts === "active" && <p className="app-notification-empty" role="status">Phone alerts active on this device.</p>}
      {isBrowser && notificationPermission !== "unsupported" && phoneAlerts !== "active" && <button type="button" className="app-notification-enable" disabled={phoneAlerts === "checking"} onClick={() => void enablePhoneAlerts()}>{phoneAlerts === "checking" ? "Checking phone alerts…" : notificationPermission === "granted" ? "Set up phone alerts" : "Enable phone alerts"}</button>}
      {isBrowser && notificationPermission === "unsupported" && <p className="app-notification-error">Phone alerts require the KLGCR app to be added to your Home Screen.</p>}
      {enableError && <p className="app-notification-error">{enableError}</p>}
    </div>}
  </div>;
}
