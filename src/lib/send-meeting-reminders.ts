import { NextResponse } from "next/server";
import { createAppNotifications } from "@/lib/app-notifications";
import { meetingIsUpcoming, meetingReminderDue, meetingReminderSlot } from "@/lib/meeting-reminder-schedule";
import { createAdminClient } from "@/lib/supabase/admin";

// Server-side helper. Callers must authenticate: cron bearer token or admin server action.
export async function sendMeetingReminders(oneTimeCatchUp = false) {
  const now = new Date();
  const date = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const catchUp = oneTimeCatchUp && date === "2026-10-16";
  if (!catchUp && !meetingReminderSlot(now)) return NextResponse.json({ ok: true, sent: 0 });
  const db = createAdminClient();
  const { data: events, error } = await db.from("calendar_events")
    .select("id,title,notes,starts_at,audience,assigned_to")
    .eq("event_type", "meeting").gt("starts_at", now.toISOString())
    .lte("starts_at", `${date}T23:59:59.999+08:00`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: profiles, error: profileError } = await db.from("profiles").select("id,role")
    .eq("is_active", true).is("deleted_at", null);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  const slotStart = `${date}T09:00:00+08:00`;
  let sent = 0;
  for (const event of events || []) {
    if ((!catchUp && !meetingReminderDue(event.starts_at, now)) || !meetingIsUpcoming(event.starts_at, new Date(), date)) continue;
    const recipients = (profiles || []).filter(person => event.audience === "all_staff" || person.id === event.assigned_to);
    const { data: existing, error: existingError } = await db.from("app_notifications").select("recipient_id")
      .eq("type", "calendar_event").eq("entity_id", event.id).eq("title", "Meeting reminder")
      .gte("created_at", slotStart);
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
    const notified = new Set((existing || []).map(row => row.recipient_id));
    for (const person of recipients) {
      if (notified.has(person.id) || !meetingIsUpcoming(event.starts_at, new Date(), date)) continue;
      const time = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit" }).format(new Date(event.starts_at));
      await createAppNotifications({ recipientIds: [person.id], type: "calendar_event", title: "Meeting reminder",
        body: `${event.title} · Today ${time}${event.notes ? ` · ${event.notes}` : ""}`,
        href: person.role === "admin" || person.role === "management_viewer" ? "/admin/calendar" : "/staff/calendar",
        entityId: event.id, expiresAt: event.starts_at });
      sent++;
    }
  }
  return NextResponse.json({ ok: true, date, sent });
}
