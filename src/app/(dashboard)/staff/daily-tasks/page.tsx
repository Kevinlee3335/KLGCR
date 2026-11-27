import { Suspense } from "react";
import { DailyTaskFilters } from "@/components/daily-task-filters";
import { taskSearchFilter, taskFilterDate, taskFilterStatuses } from "@/lib/daily-task-filters";
import { DirectPageLink } from "@/components/direct-page-link";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

export default async function StaffDailyTasks({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireRole(["maintenance_staff", "cleaner"]);
  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date || "") ? params.date! : today();
  return <AppShell profile={profile} title="Daily Tasks"><div className="section-head"><div><p className="eyebrow">My work for the day</p><h2>Daily Tasks</h2><p className="subtle">Open each task for details, completion notes and photo evidence.</p></div><DirectPageLink className="button secondary" href="/staff/daily-tasks">All Records</DirectPageLink></div><DailyTaskFilters filters={params}/><Suspense key={JSON.stringify(params)} fallback={<p className="subtle" role="status">Loading your daily tasks…</p>}><DailyTaskList date={date} staffId={profile.id} params={params}/></Suspense></AppShell>;
}

async function DailyTaskList({date, staffId, params}: {date: string; staffId: string; params: Record<string,string|undefined>}) {
  const pageSize = 50;
  const page = /^[1-9]\d{0,6}$/.test(params.page ?? "") ? Number(params.page) : 1;
  const offset = (page - 1) * pageSize;
  const db = await createClient();
  const { error: materializeError } = await db.rpc("materialize_recurring_tasks", { p_date: date });
  const allRecords = !taskFilterDate(params.date);
  let taskQuery = db.from("admin_daily_tasks").select("id,title,notes,status,task_date,recurrence_id").eq("assigned_to", staffId);
  if (!allRecords) taskQuery = taskQuery.eq("task_date", date);
  const search = taskSearchFilter(params.q);
  if (search) taskQuery = taskQuery.or(search);
  if (taskFilterDate(params.from)) taskQuery = taskQuery.gte("task_date", params.from!);
  if (taskFilterDate(params.to)) taskQuery = taskQuery.lte("task_date", params.to!);
  if (taskFilterStatuses.includes(params.status as typeof taskFilterStatuses[number])) taskQuery = taskQuery.eq("status", params.status!);
  const { data, error } = await taskQuery.order("task_date", { ascending: false }).order("created_at").order("id").range(offset, offset + pageSize);
  const tasks = data?.slice(0, pageSize);
  const hasNext = (data?.length ?? 0) > pageSize;
  function href(number: number) {
    const query = new URLSearchParams();
    for (const key of ["date", "q", "from", "to", "status"]) if (params[key]) query.set(key, params[key]);
    if (number > 1) query.set("page", String(number));
    return "/staff/daily-tasks" + (query.size ? "?" + query : "");
  }
  return <>{(params.error || materializeError || error) && <p className="error">{params.error || materializeError?.message || error?.message}</p>}<div className="daily-task-list cleaner-daily-task-list">{(tasks || []).map((task) => <Link className="panel daily-task-card daily-task-link" key={task.id} href={`/staff/daily-tasks/${task.id}`}><div className="record-head"><strong>{task.title}</strong><span className={`status-badge status-${task.status}`}>{task.status.replaceAll("_", " ")}</span></div><p>{task.notes || "No additional instructions."}</p><small>{task.recurrence_id ? "Repeating task" : "One-time task"} · Due {task.task_date}</small></Link>)}</div>{!error && !tasks?.length && <section className="panel empty"><strong>No assigned daily tasks {allRecords ? "in the records" : "for this date"}.</strong><span>Repeating tasks will appear here automatically on their due date.</span></section>}{!error && (page > 1 || hasNext) && <nav className="actions" aria-label="Daily task pages">
    {page > 1 && <a className="button secondary" href={href(page - 1)}>Previous</a>}
    <span>Page {page}</span>
    {hasNext && <a className="button secondary" href={href(page + 1)}>Next</a>}
  </nav>}</>;
}
