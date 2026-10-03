import { NextRequest, NextResponse } from "next/server";
import { createAppNotifications } from "@/lib/app-notifications";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const date = today();
  const { error: materializeError } = await db.rpc("materialize_recurring_tasks", { p_date: date });
  if (materializeError) return NextResponse.json({ error: materializeError.message }, { status: 500 });
  const { data: tasks, error } = await db.from("admin_daily_tasks").select("id,title,assigned_to").eq("task_date", date).not("status", "eq", "completed").is("due_notification_sent_at", null).not("assigned_to", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let sent = 0;
  for (const task of tasks || []) {
    const { data: claimed } = await db.from("admin_daily_tasks").update({ due_notification_sent_at: new Date().toISOString() }).eq("id", task.id).is("due_notification_sent_at", null).select("id").maybeSingle();
    if (!claimed || !task.assigned_to) continue;
    try {
      await createAppNotifications({ recipientIds: [task.assigned_to], type: "daily_task_assigned", title: "Daily task due today", body: task.title, href: `/staff/daily-tasks/${task.id}`, entityId: String(task.id) });
      sent += 1;
    } catch (notificationError) {
      console.error("Unable to send daily task reminder", notificationError);
      await db.from("admin_daily_tasks").update({ due_notification_sent_at: null }).eq("id", task.id);
    }
  }
  return NextResponse.json({ ok: true, date, sent });
}
