/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DailyTaskForm } from "@/components/daily-task-form";
import { dailyTaskCategories, dailyTaskCategoryLabel, type DailyTaskCategory } from "@/lib/daily-tasks";

function myDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const workStates = [["standard", "Normal"], ["partially_completed", "Partially Completed"], ["appointment", "Appointment"], ["kiv", "KIV"]] as const;
const dailyTaskStatuses = ["pending", "accepted", "in_progress", "completed", "kiv"] as const;
const dailyTaskSortOptions = [
  ["work_date:asc", "Work date · Ascending"],
  ["work_date:desc", "Work date · Descending"],
  ["created_at:asc", "Created time · Ascending"],
  ["created_at:desc", "Created time · Descending"],
  ["status:asc", "Status · Ascending (A–Z)"],
  ["status:desc", "Status · Descending (Z–A)"],
] as const;

function selectedDailyTaskSort(filters: Record<string, string | undefined>) {
  if (dailyTaskSortOptions.some(([value]) => value === filters.sort)) {
    const [sortBy, direction] = filters.sort!.split(":");
    return { value: filters.sort!, sortBy, ascending: direction === "asc" };
  }

  const sortBy = ["work_date", "created_at", "status"].includes(filters.sortBy || "") ? filters.sortBy! : "created_at";
  const ascending = filters.sortOrder === "asc";
  return { value: `${sortBy}:${ascending ? "asc" : "desc"}`, sortBy, ascending };
}

export default async function DailyTasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const filters = await searchParams;
  const date = filters.date || myDate();
  const db: any = await createClient();
  const category = dailyTaskCategories.includes(filters.category as DailyTaskCategory) ? filters.category as DailyTaskCategory : undefined;
  const categoryLabel = category ? dailyTaskCategoryLabel[category] : "Daily Tasks";
  const selectedStatus = category && dailyTaskStatuses.includes(filters.status as typeof dailyTaskStatuses[number]) ? filters.status as typeof dailyTaskStatuses[number] : "";
  const sort = selectedDailyTaskSort(filters);
  const { sortBy, ascending } = sort;

  let taskQuery = db.from("admin_daily_tasks")
    .select("id,task_category,task_date,title,notes,status,created_at,accepted_at,started_at,completed_at,assignee:profiles!assigned_to(full_name),activity:daily_task_activity(id,action,comment,created_at,actor:profiles!daily_task_activity_actor_id_fkey(full_name))")
    .eq("task_date", date);
  let recurrenceQuery = db.from("recurring_daily_tasks")
    .select("id,task_category,title,frequency,day_number,assignee:profiles!assigned_to(full_name)").eq("is_active", true);
  if (category) {
    taskQuery = taskQuery.eq("task_category", category);
    recurrenceQuery = recurrenceQuery.eq("task_category", category);
  }
  if (selectedStatus) taskQuery = taskQuery.eq("status", selectedStatus);
  taskQuery = taskQuery.order(category ? (sortBy === "work_date" ? "task_date" : sortBy) : "created_at", { ascending: category ? ascending : true });

  const [{ data: jobs, error }, { data: adminTasks }, { data: appointments }, { data: employees }, { data: recurrences }] = await Promise.all([
    db.from("maintenance_jobs").select("id,job_no,room_no,category,status,work_state,scheduled_for,complaint:complaints!complaint_id(availability_date,availability_time,room_access_permission),block:blocks!block_id(code),assignee:profiles!assigned_to(full_name)").not("status", "in", '("completed","cancelled")').order("scheduled_for", { ascending: true, nullsFirst: false }).order("assigned_at", { ascending: true }),
    taskQuery,
    db.from("appointments").select("id,appointment_date,appointment_time,status,remarks,complaint:complaints!complaint_id(room_no,category,availability_date,availability_time,room_access_permission,block:blocks!block_id(code)),staff:profiles!assigned_staff(full_name)").eq("appointment_date", date).not("status", "in", '("cancelled","no_show")').order("appointment_time"),
    db.from("profiles").select("id,full_name").eq("is_active", true).is("deleted_at", null).order("full_name"),
    recurrenceQuery,
  ]);

  const isAdmin = profile.role === "admin";
  const dailyTaskRows = (adminTasks ?? []) as any[];
  const taskIds = dailyTaskRows.map((task) => Number(task.id)).filter(Number.isSafeInteger);
  const { data: taskPhotos } = taskIds.length
    ? await db.from("daily_task_photos").select("id,task_id,storage_path,created_at").in("task_id", taskIds).order("created_at")
    : { data: [] as any[] };
  const signedTaskPhotos = await Promise.all((taskPhotos || []).map(async (photo: any) => ({
    ...photo,
    url: (await db.storage.from("checkout-evidence").createSignedUrl(photo.storage_path, 3600)).data?.signedUrl,
  })));
  const taskPhotosByTaskId = new Map<number, typeof signedTaskPhotos>();
  for (const photo of signedTaskPhotos) {
    const existing = taskPhotosByTaskId.get(Number(photo.task_id)) || [];
    existing.push(photo);
    taskPhotosByTaskId.set(Number(photo.task_id), existing);
  }

  const rows = ((jobs ?? []) as any[]).filter((row) => row.complaint?.room_access_permission !== "no");
  const appointmentRows = (appointments ?? []) as any[];
  const today = rows.filter((row) => row.scheduled_for === date);
  const unscheduled = rows.filter((row) => !row.scheduled_for);
  const categoryField = category && <input type="hidden" name="taskCategory" value={category} />;
  const stateForm = (job: any) => isAdmin
    ? <form action="/admin/daily-tasks/action" method="post" className="daily-table-control"><input type="hidden" name="action" value="work_state" /><input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="date" value={date} /><select name="workState" aria-label="Progress label" defaultValue={job.work_state ?? "standard"}>{workStates.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="button secondary button-compact">Save</button></form>
    : String(job.work_state ?? "standard").replaceAll("_", " ");

  return <AppShell profile={profile} title={categoryLabel}>
    <div className="section-head">
      <div><h2>{categoryLabel}</h2><p className="subtle">{category ? "Create, assign and follow up the Daily Tasks for this working day." : "Schedule approved jobs for a working day. The 9:30AM report uses this list."}</p></div>
      <div className="actions"><Link className="button secondary" href="/admin/daily-tasks/photos">View Completion Photos</Link><form className="daily-task-list-controls">{category && <input type="hidden" name="category" value={category} />}<input type="date" name="date" defaultValue={date} />{category && <><select name="status" defaultValue={selectedStatus} aria-label="Status filter"><option value="">Status: All</option>{dailyTaskStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select><select name="sort" defaultValue={sort.value} aria-label="Sort tasks">{dailyTaskSortOptions.map(([value, label]) => <option key={value} value={value}>Sort: {label}</option>)}</select></>}<button className="button secondary">{category ? "Apply" : "View"}</button></form></div>
    </div>
    {filters.error && <p className="error">{filters.error}</p>}{error && <p className="error">{error.message}</p>}
    <section className="panel">
      <div className="section-head"><div><h3>{categoryLabel} · {date}</h3><p className="subtle">Tasks shown here are linked to the employee they are assigned to.</p></div></div>
      {isAdmin && <DailyTaskForm date={date} staff={employees || []} />}
      <div className="daily-task-list">
        {!dailyTaskRows.length ? <p className="subtle">No {category ? categoryLabel.toLowerCase() : "daily tasks"} for this date.</p> : dailyTaskRows.map((task) => {
          const photos = taskPhotosByTaskId.get(Number(task.id)) || [];
          return <article className="panel daily-task-card" key={task.id}>
            <div className="section-head"><div><h3>{task.title}</h3><p>{task.assignee?.full_name || "Unassigned"} · {String(task.status).replaceAll("_", " ")}</p><p className="subtle">{task.notes || "-"}</p></div>
              {isAdmin && <div className="daily-task-actions">
                <form action="/admin/daily-tasks/action" method="post" className="daily-task-update"><input type="hidden" name="action" value="admin_task_status" /><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="date" value={date} />{categoryField}<select name="status" aria-label="Task status" defaultValue={task.status}><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="kiv">KIV</option></select><input name="comment" maxLength={1000} placeholder="Add update note" /><button className="button secondary button-compact">Update</button></form>
                <form action="/admin/daily-tasks/action" method="post"><input type="hidden" name="action" value="admin_task_delete" /><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="date" value={date} />{categoryField}<button className="button danger button-compact" aria-label={`Delete ${task.title}`}>Delete</button></form>
              </div>}
            </div>
            {photos.length > 0 && <section className="checkout-evidence"><h4>Completion photos</h4><div className="photo-grid">{photos.map((photo) => photo.url && <a href={photo.url} target="_blank" rel="noreferrer" key={photo.id}><img src={photo.url} alt="Daily task completion evidence" /><span>{new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(photo.created_at))}</span></a>)}</div></section>}
            <details><summary>Timeline</summary>{task.activity?.length ? <ol className="activity-timeline">{task.activity.map((entry: any) => <li key={entry.id}><div className="activity-marker" /><time><strong>{new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric" }).format(new Date(entry.created_at))}</strong><span>{new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(entry.created_at))}</span></time><div className="activity-content"><strong>{entry.action}</strong>{entry.actor?.full_name && <span className="activity-actor">{entry.actor.full_name}</span>}{entry.comment && <p>{entry.comment}</p>}</div></li>)}</ol> : <p className="subtle">No progress update yet.</p>}</details>
          </article>;
        })}
      </div>
    </section>

    {!category && <>
      <section className="panel" style={{ marginTop: 18 }}><h3>{date} · Scheduled Appointments ({appointmentRows.length})</h3>{!appointmentRows.length ? <p className="subtle">No appointments scheduled for this date.</p> : <div className="table-wrap"><table className="table"><thead><tr><th>Time</th><th>Room</th><th>Category</th><th>Staff</th><th>Room Access Permission</th><th>Appointment Status</th><th>Remarks</th></tr></thead><tbody>{appointmentRows.map((appointment: any) => <tr key={appointment.id}><td>{appointment.appointment_time.slice(0, 5)}</td><td>Block {appointment.complaint?.block?.code} {appointment.complaint?.room_no}</td><td>{appointment.complaint?.category}</td><td>{appointment.staff?.full_name}</td><td>{String(appointment.complaint?.room_access_permission || "Not set").replaceAll("_", " ")}</td><td>{String(appointment.status).replaceAll("_", " ")}</td><td>{appointment.remarks || "—"}</td></tr>)}</tbody></table></div>}</section>
      <section className="panel" style={{ marginTop: 18 }}><h3>{date} · Scheduled Maintenance Tasks ({today.length})</h3>{!today.length ? <p className="subtle">No jobs scheduled for this date.</p> : <div className="table-wrap"><table className="table"><thead><tr><th>Job</th><th>Room</th><th>Category</th><th>Staff</th><th>Core Status</th><th>Progress Label</th><th>Schedule</th></tr></thead><tbody>{today.map((job) => <tr key={job.id}><td>{job.job_no}</td><td>Block {job.block?.code} {job.room_no}</td><td>{job.category}</td><td>{job.assignee?.full_name}</td><td>{job.status.replaceAll("_", " ")}</td><td>{stateForm(job)}</td><td>{isAdmin ? <form action="/admin/daily-tasks/action" method="post" className="daily-table-control"><input type="hidden" name="action" value="schedule" /><input type="hidden" name="jobId" value={job.id} /><input type="date" name="date" defaultValue={job.scheduled_for ?? date} /><button className="button secondary button-compact">Change</button></form> : job.scheduled_for}</td></tr>)}</tbody></table></div>}</section>
      <section className="panel" style={{ marginTop: 18 }}><h3>Unscheduled Active Jobs ({unscheduled.length})</h3>{!unscheduled.length ? <p className="subtle">All active jobs have a schedule.</p> : <div className="table-wrap"><table className="table"><thead><tr><th>Job</th><th>Room</th><th>Category</th><th>Staff</th><th>Core Status</th><th>Progress Label</th><th>Add to Day</th></tr></thead><tbody>{unscheduled.map((job) => <tr key={job.id}><td>{job.job_no}</td><td>Block {job.block?.code} {job.room_no}</td><td>{job.category}</td><td>{job.assignee?.full_name}</td><td>{job.status.replaceAll("_", " ")}</td><td>{stateForm(job)}</td><td>{isAdmin ? <form action="/admin/daily-tasks/action" method="post" className="daily-table-control"><input type="hidden" name="action" value="schedule" /><input type="hidden" name="jobId" value={job.id} /><input type="date" name="date" defaultValue={date} /><button className="button button-compact">Schedule</button></form> : "Admin only"}</td></tr>)}</tbody></table></div>}</section>
    </>}

    <section className="panel"><h3>{category ? `${categoryLabel} · Recurring tasks` : "Recurring tasks"}</h3>{recurrences?.map((task: any) => <div className="list-row" key={task.id}><div><strong>{task.title}</strong><p>{task.assignee?.full_name} · {task.frequency === "monthly" ? `Day ${task.day_number} of every month` : `${task.frequency === "biweekly" ? "Every 2 Weeks" : "Every week"} · ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][task.day_number]}`}</p></div>{isAdmin && <form action="/admin/daily-tasks/action" method="post"><input type="hidden" name="action" value="recurrence_stop" /><input type="hidden" name="date" value={date} />{categoryField}<input type="hidden" name="recurrenceId" value={task.id} /><button className="button secondary">Stop repeating</button></form>}</div>)}{!recurrences?.length && <p>No recurring tasks.</p>}</section>
  </AppShell>;
}
