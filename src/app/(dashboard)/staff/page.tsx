import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { JobList } from "@/components/phase2-ui";
import { createClient } from "@/lib/supabase/server";
import type { JobRow } from "@/lib/phase2";

function malaysiaToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date()); }

async function CleanerDashboard({ profile }: { profile: Awaited<ReturnType<typeof requireRole>> }) {
  const supabase = await createClient();
  const today = malaysiaToday();
  const { error: materializeError } = await supabase.rpc("materialize_recurring_tasks", { p_date: today });
  const [tasksResult, checkoutResult, reportsResult] = await Promise.all([
    supabase.from("admin_daily_tasks").select("id,title,notes,status,task_date,recurrence_id").eq("assigned_to", profile.id).or(`task_date.eq.${today},and(task_date.lt.${today},status.neq.completed)`).order("task_date").order("created_at"),
    supabase.from("checkout_rooms").select("id,reference_no,room_no,status,block:blocks!block_id(code)").eq("cleaner_id", profile.id).in("status", ["cleaning", "verification"]).order("updated_at", { ascending: false }).limit(5),
    supabase.from("complaints").select("id").eq("source", "cleaning").limit(1),
  ]);
  const tasks = tasksResult.data || [];
  const checkouts = (checkoutResult.data || []) as unknown as Array<{ id: string; reference_no: string | null; room_no: string; status: string; block: { code: string } | null }>;
  return <AppShell profile={profile} title="Dashboard"><div className="section-head"><div><p className="eyebrow">Cleaner workspace</p><h2>Today&apos;s work</h2><p className="subtle">Your assigned cleaning tasks, check-out rooms and reports in one place.</p></div><Link className="button" href="/staff/complaints/new">New Complaint</Link></div>{(materializeError || tasksResult.error || checkoutResult.error || reportsResult.error) && <p className="error">{materializeError?.message || tasksResult.error?.message || checkoutResult.error?.message || reportsResult.error?.message}</p>}<section className="panel"><div className="section-head"><div><h3>Daily Tasks · {today}</h3><p className="subtle">Today’s tasks and earlier unfinished tasks.</p></div><Link className="text-link" href="/staff/daily-tasks">All Records</Link></div><div className="daily-task-list cleaner-daily-task-list">{tasks.map((task) => <Link className="panel daily-task-card daily-task-link" key={task.id} href={`/staff/daily-tasks/${task.id}`}><div className="record-head"><strong>{task.title}</strong><span className={`status-badge status-${task.status}`}>{task.status.replaceAll("_", " ")}</span></div><p>{task.notes || "No additional instructions."}</p><small>{task.recurrence_id ? "Repeating task" : "One-time task"} · Due {task.task_date}{task.task_date < today ? " · Overdue" : ""}</small></Link>)}</div>{!tasks.length && <p className="subtle">No daily tasks due today.</p>}</section><section className="panel" style={{ marginTop: 18 }}><div className="section-head"><div><h3>Check-out Rooms</h3><p className="subtle">Rooms handed over to you for housekeeping.</p></div><Link className="text-link" href="/staff/checkouts">Open rooms</Link></div>{checkouts.length ? <div className="mobile-cards" style={{ display:"grid" }}>{checkouts.map((room) => <Link className="panel record-card" href={`/staff/checkouts/${room.id}`} key={room.id}><div className="record-head"><strong>{room.reference_no || "Check-out room"}</strong><span className={`status-badge status-${room.status}`}>{room.status.replaceAll("_", " ")}</span></div><h3>Block {room.block?.code || "–"} · Room {room.room_no}</h3></Link>)}</div> : <p className="subtle">No check-out rooms are waiting for cleaning.</p>}</section><section className="panel" style={{ marginTop: 18 }}><div className="section-head"><div><h3>My Reports</h3><p className="subtle">Track the status of defects you submitted.</p></div><Link className="text-link" href="/staff/complaints">View report status</Link></div><Link className="button secondary" href="/staff/complaints/new">Report a defect</Link></section></AppShell>;
}

export default async function StaffPage() {
  const profile = await requireRole(["maintenance_staff", "cleaner"]);
  if (profile.role === "cleaner") return <CleanerDashboard profile={profile}/>;
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date());
  const [statusResult, recentResult, appointmentResult] = await Promise.all([
    supabase.from("maintenance_jobs").select("status").eq("assigned_to", profile.id),
    supabase.from("maintenance_jobs").select("id,job_no,room_no,category,description,priority,status,assigned_to,assigned_at,updated_at,complaint:complaints!complaint_id(id,complaint_no,availability_date,availability_time,room_access_permission),block:blocks!block_id(id,code)").eq("assigned_to", profile.id).order("assigned_at", { ascending: false }).limit(5),
    supabase.from("appointments").select("id,job_id,appointment_date,appointment_time,status,complaint:complaints!complaint_id(room_no,category,complainant_contact,availability_date,availability_time,room_access_permission,block:blocks!block_id(code))").eq("appointment_date",today).not("status","in",'("completed","cancelled","no_show")').order("appointment_date").order("appointment_time").limit(10),
  ]);
  const statuses = statusResult.data || [];
  const jobs = (recentResult.data || []) as unknown as JobRow[];
  const complaintIds = [...new Set(jobs.map((job) => job.complaint?.id).filter((id): id is string => Boolean(id)))];
  const appointmentsByComplaint = new Map<string, NonNullable<JobRow["appointments"]>>();
  if (complaintIds.length) {
    const { data: jobAppointments } = await supabase.from("appointments")
      .select("complaint_id,appointment_date,appointment_time,status")
      .in("complaint_id", complaintIds);
    for (const appointment of jobAppointments || []) {
      const existing = appointmentsByComplaint.get(appointment.complaint_id) || [];
      existing.push(appointment);
      appointmentsByComplaint.set(appointment.complaint_id, existing);
    }
  }
  const rows = jobs.map((job) => ({ ...job, appointments: job.complaint?.id ? appointmentsByComplaint.get(job.complaint.id) || [] : [] }));
  const blocks = profile.blocks?.map((block) => `Block ${block.code}`).join(" & ");
  const count = (status: string) => statuses.filter((row) => row.status === status).length;
  const appointments=(appointmentResult.data||[]) as unknown as Array<{id:string;job_id:string|null;appointment_date:string;appointment_time:string;status:string;complaint:{room_no:string;category:string;complainant_contact:string|null;room_access_permission:string|null;block:{code:string}|null}|null}>;

  return <AppShell profile={profile} title="My Dashboard">
    <Dashboard kind="staff" name={profile.full_name} blocks={blocks} values={[count("assigned"), count("in_progress"), count("pending_material"), count("completed")]} hrefs={["/staff/tasks?status=assigned", "/staff/tasks?status=in_progress", "/staff/tasks?status=pending_material", "/staff/tasks?status=completed"]}/>
    <section className="panel" style={{marginTop:24}}>
      <div className="section-head"><div><h2>Today&apos;s Appointments</h2><p className="subtle">Scheduled maintenance visits across the maintenance team.</p></div><Link className="text-link" href="/staff/calendar">Open Calendar</Link></div>
      {!appointments.length?<p className="subtle">No upcoming appointments.</p>:<div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Time</th><th>Block</th><th>Room</th><th>Category</th><th>Room Access Permission</th><th>Resident Phone</th><th>Appointment Status</th></tr></thead><tbody>{appointments.map(a=><tr key={a.id}><td>{a.job_id?<Link className="text-link" href={`/staff/jobs/${a.job_id}`}>{a.appointment_date}</Link>:a.appointment_date}</td><td>{a.appointment_time.slice(0,5)}</td><td>{a.complaint?.block?.code||"—"}</td><td>{a.complaint?.room_no||"—"}</td><td>{a.complaint?.category||"—"}</td><td>{a.complaint?.room_access_permission?.replaceAll("_"," ")||"Not set"}</td><td>{a.complaint?.complainant_contact||"—"}</td><td><span className={`status-badge status-${a.status}`}>{a.status.replaceAll("_"," ")}</span></td></tr>)}</tbody></table></div>}
    </section>
    <div className="section-head tasks-head"><h2>Maintenance Jobs</h2><Link className="text-link" href="/staff/tasks">View current tasks</Link></div>
    <section className="panel list-panel">{recentResult.error ? <p className="error">{recentResult.error.message}</p> : <JobList rows={rows} staff compact viewerId={profile.id}/>}</section>
  </AppShell>;
}
