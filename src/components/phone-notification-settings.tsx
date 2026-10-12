"use client";
import { useActionState, useState } from "react";
import { savePhoneNotificationPreferences } from "@/app/(dashboard)/admin/settings/actions";
import { notificationOptions, type PushPreferences, type NotificationKey } from "@/lib/notification-preferences";

type Member = { id: string; full_name: string; role: string };
function EmployeeSettings({ member, preference }: { member: Member; preference?: PushPreferences }) {
  const [state, action, pending] = useActionState(savePhoneNotificationPreferences, {});
  const [enabled, setEnabled] = useState(preference?.enabled !== false);
  const [events, setEvents] = useState<Partial<Record<NotificationKey, boolean>>>(preference?.events || {});
  const setAll = (value: boolean) => setEvents(Object.fromEntries(notificationOptions.map(([key]) => [key, value])));
  return <form action={action}>
    <input type="hidden" name="userId" value={member.id}/>
    <label className="phone-master"><input type="checkbox" name="enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} disabled={pending}/> Enable phone notifications for {member.full_name}</label>
    <div className="phone-settings-actions"><button type="button" className="button secondary" onClick={() => setAll(true)} disabled={pending}>Enable all types</button><button type="button" className="button secondary" onClick={() => setAll(false)} disabled={pending}>Disable all types</button></div>
    <div className="phone-settings-grid">{notificationOptions.map(([key, label]) => <label key={key}><span>{label}</span><input type="checkbox" role="switch" name={`event:${key}`} checked={events[key] !== false} onChange={e => setEvents({...events, [key]: e.target.checked})} disabled={pending} aria-label={label}/></label>)}</div>
    <p className="subtle">Types only apply when this employee is an intended recipient. Bell history is retained. Google Form monitoring detects failures received by this system; it cannot detect a form that never reaches the server.</p>
    {state.error && <p role="alert" className="error">{state.error}</p>}{state.ok && <p role="status" className="success">{state.ok}</p>}
    <button className="button" disabled={pending}>{pending ? "Saving…" : "Save notification settings"}</button>
  </form>;
}
export function PhoneNotificationSettings({ members, preferences }: { members: Member[]; preferences: PushPreferences[] }) {
  const [id, setId] = useState(members[0]?.id || "");
  const member = members.find(m => m.id === id);
  return <section className="panel phone-settings-panel"><h2>Phone Notification Settings</h2><p className="subtle">Select an employee and choose which events send a phone notification. Existing notifications remain enabled until you save changes.</p><label className="phone-employee-picker">Employee<select value={id} onChange={e => setId(e.target.value)}>{members.map(m => <option key={m.id} value={m.id}>{m.full_name} · {m.role.replaceAll("_", " ")}</option>)}</select></label>{member && <EmployeeSettings key={id} member={member} preference={preferences.find(p => p.user_id === id)}/>}</section>;
}
