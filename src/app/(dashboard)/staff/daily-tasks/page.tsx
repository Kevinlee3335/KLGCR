import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

export default async function StaffDailyTasks({ searchParams }: { searchParams: Promise<{ date?: string; error?: string }> }) {
  const profile = await requireRole(["maintenance_staff", "cleaner"]);
  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date || "") ? params.date! : today();
  const db = await createClient();
  const { error: materializeError } = await db.rpc("materialize_recurring_tasks", { p_date: date });
  const { data: tasks, error } = await db.from("admin_daily_tasks").select("id,title,notes,status,task_date,recurrence_id").eq("assigned_to", profile.id).eq("task_date", date).order("created_at");
  return <AppShell profile={profile} title="Daily Tasks"><div className="section-head"><div><p className="eyebrow">My work for the day</p><h2>Daily Tasks</h2><p className="subtle">Open each task for details, completion notes and photo evidence.</p></div><form><input type="date" name="date" defaultValue={date}/><button className="button secondary" style={{ marginLeft: 8 }}>View</button></form></div>{(params.error || materializeError || error) && <p className="error">{params.error || materializeError?.message || error?.message}</p>}<div className="daily-task-list cleaner-daily-task-list">{(tasks || []).map((task) => <Link className="panel daily-task-card daily-task-link" key={task.id} href={`/staff/daily-tasks/${task.id}`}><div className="record-head"><strong>{task.title}</strong><span className={`status-badge status-${task.status}`}>{task.status.replaceAll("_", " ")}</span></div><p>{task.notes || "No additional instructions."}</p><small>{task.recurrence_id ? "Repeating task" : "One-time task"} · Due {task.task_date}</small></Link>)}</div>{!tasks?.length && <section className="panel empty"><strong>No assigned daily tasks for this date.</strong><span>Repeating tasks will appear here automatically on their due date.</span></section>}</AppShell>;
}
