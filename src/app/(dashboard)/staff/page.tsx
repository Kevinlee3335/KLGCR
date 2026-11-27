import { Suspense } from "react";
import { CheckoutDefectFollowUp } from "@/components/checkout-defect-follow-up";
import { DirectPageLink } from "@/components/direct-page-link";
import Link from "next/link";
import { ArrowUpRight, DoorOpen } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { StaffJobList } from "@/components/staff-job-list";
import { StaffMonitoringFollowUp } from "@/components/staff-monitoring-follow-up";
import followUpStyles from "@/components/monitoring-follow-up.module.css";
import { createClient } from "@/lib/supabase/server";
import { malaysiaDate } from "@/lib/monitoring-follow-up";
import { getStaffMonitoringFollowUps } from "@/lib/staff-monitoring-follow-up";
import { readStaffJobs } from "@/lib/staff-job-list";

type Database = Awaited<ReturnType<typeof createClient>>;

function Loading() { return <p className="subtle" role="status">Loading records…</p>; }

async function CleanerDashboard({ profile }: { profile: Awaited<ReturnType<typeof requireRole>> }) {
  const db = await createClient();
  const today = malaysiaDate();
  return <AppShell profile={profile} title="Dashboard"><div className="section-head"><div><p className="eyebrow">Cleaner workspace</p><h2>Today&apos;s work</h2><p className="subtle">Your assigned cleaning tasks, check-out rooms and reports in one place.</p></div><Link className="button" href="/staff/complaints/new">New Complaint</Link></div><section className="panel"><div className="section-head"><div><h3>Daily Tasks · {today}</h3><p className="subtle">Today’s tasks and earlier unfinished tasks.</p></div><DirectPageLink className="text-link" href="/staff/daily-tasks">All Records</DirectPageLink></div><Suspense fallback={<Loading/>}><CleanerTasks db={db} today={today} staffId={profile.id}/></Suspense></section><section className="panel" style={{ marginTop: 18 }}><div className="section-head"><div><h3>Check-out Rooms</h3><p className="subtle">Rooms handed over to you for housekeeping.</p></div><Link className="text-link" href="/staff/checkouts">Open rooms</Link></div><Suspense fallback={<Loading/>}><CleanerRooms db={db} staffId={profile.id}/></Suspense></section><section className="panel" style={{ marginTop: 18 }}><div className="section-head"><div><h3>My Reports</h3><p className="subtle">Track the status of defects you submitted.</p></div><Link className="text-link" href="/staff/complaints">View report status</Link></div><Link className="button secondary" href="/staff/complaints/new">Report a defect</Link></section></AppShell>;
}

async function CleanerTasks({ db, staffId, today }: { db: Database; staffId: string; today: string }) {
  const materialized = await db.rpc("materialize_recurring_tasks", { p_date: today });
  const {data, error} = await db.from("admin_daily_tasks").select("id,title,notes,status,task_date,recurrence_id").eq("assigned_to", staffId)
    .or(`task_date.eq.${today},and(task_date.lt.${today},status.neq.completed)`).order("task_date").order("created_at");
  const tasks = data ?? [];
  return <>{(materialized.error || error) && <p className="error">{materialized.error?.message || error?.message}</p>}<div className="daily-task-list cleaner-daily-task-list">{tasks.map((task) => <Link className="panel daily-task-card daily-task-link" key={task.id} href={`/staff/daily-tasks/${task.id}`}><div className="record-head"><strong>{task.title}</strong><span className={`status-badge status-${task.status}`}>{task.status.replaceAll("_", " ")}</span></div><p>{task.notes || "No additional instructions."}</p><small>{task.recurrence_id ? "Repeating task" : "One-time task"} · Due {task.task_date}{task.task_date < today ? " · Overdue" : ""}</small></Link>)}</div>{!tasks.length && <p className="subtle">No daily tasks due today.</p>}</>;
}

async function CleanerRooms({ db, staffId }: { db: Database; staffId: string }) {
  const {data, error} = await db.from("checkout_rooms").select("id,reference_no,room_no,status,block:blocks!block_id(code)").eq("cleaner_id", staffId)
    .in("status", ["cleaning", "verification"]).order("updated_at", { ascending: false }).limit(5);
  if (error) return <p className="error">{error.message}</p>;
  const checkouts = (data ?? []) as unknown as Array<{ id: string; reference_no: string | null; room_no: string; status: string; block: { code: string } | null }>;
  return <>{checkouts.length ? <div className="mobile-cards" style={{ display:"grid" }}>{checkouts.map((room) => <Link className="panel record-card" href={`/staff/checkouts/${room.id}`} key={room.id}><div className="record-head"><strong>{room.reference_no || "Check-out room"}</strong><span className={`status-badge status-${room.status}`}>{room.status.replaceAll("_", " ")}</span></div><h3>Block {room.block?.code || "–"} · Room {room.room_no}</h3></Link>)}</div> : <p className="subtle">No check-out rooms are waiting for cleaning.</p>}</>;
}

export default async function StaffPage() {
  const profile = await requireRole(["maintenance_staff", "cleaner"]);
  if (profile.role === "cleaner") return <CleanerDashboard profile={profile}/>;
  const supabase = await createClient();
  const today = malaysiaDate();
  const counts = readJobCounts(supabase, profile.id);
  const blocks = profile.blocks?.map((block) => `Block ${block.code}`).join(" & ");
  const statuses = ["assigned", "in_progress", "pending_material", "completed"];
  const values = statuses.map(status => <Suspense key={status} fallback="—"><Count counts={counts} status={status}/></Suspense>);
  return <AppShell profile={profile} title="My Dashboard">
    <Dashboard kind="staff" name={profile.full_name} blocks={blocks} values={values} hrefs={statuses.map(status => `/staff/tasks?status=${status}`)}/>
    <Suspense fallback={null}><WaitingCheckouts counts={counts}/></Suspense>
    <Suspense fallback={null}><CheckoutDefectFollowUp staffId={profile.id}/></Suspense>
    <Suspense fallback={null}><CheckoutRooms db={supabase} staffId={profile.id}/></Suspense>
    <Suspense fallback={null}><Monitoring db={supabase} staffId={profile.id} today={today}/></Suspense>
    <section className="panel" style={{marginTop:24}}>
      <div className="section-head"><div><h2>Today&apos;s Appointments</h2><p className="subtle">Scheduled maintenance visits across the maintenance team.</p></div><Link className="text-link" href="/staff/calendar">Open Calendar</Link></div>
      <Suspense fallback={<Loading/>}><Appointments db={supabase} today={today}/></Suspense>
    </section>
    <div className="section-head tasks-head"><h2>Maintenance Jobs</h2><Link className="text-link" href="/staff/tasks">View current tasks</Link></div>
    <section className="panel list-panel"><Suspense fallback={<Loading/>}><RecentJobs db={supabase} staffId={profile.id}/></Suspense></section>
  </AppShell>;
}

async function readJobCounts(db: Database, staffId: string) {
  const counts = new Map<string, number>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("maintenance_jobs").select("status").eq("assigned_to", staffId)
      .in("status", ["assigned", "in_progress", "pending_material", "completed", "waiting_checkout"]).order("id").range(offset, offset + 999);
    if (error) return null;
    for (const {status} of data) counts.set(status, (counts.get(status) ?? 0) + 1);
    if (data.length < 1000) return counts;
  }
}
type Counts = ReturnType<typeof readJobCounts>;
async function Count({counts, status}: {counts: Counts; status: string}) {
  const result = await counts;
  return result ? result.get(status) ?? 0 : "—";
}
async function WaitingCheckouts({counts}: {counts: Counts}) {
  const waiting = (await counts)?.get("waiting_checkout");
  return waiting ? <p><Link className="button secondary" href="/staff/tasks?status=waiting_checkout">Waiting for Check-out · {waiting}</Link></p> : null;
}
async function RecentJobs({ db, staffId }: { db: Database; staffId: string }) {
  const { rows, appointments, error } = await readStaffJobs(db, staffId, { recent: true });
  return error ? <p className="error">{error.message}</p> : <StaffJobList rows={rows} appointments={appointments} compact viewerId={staffId}/>;
}
async function Monitoring({ db, staffId, today }: { db: Database; staffId: string; today: string }) {
  return <StaffMonitoringFollowUp {...await getStaffMonitoringFollowUps(db, staffId, today)} today={today}/>;
}
async function CheckoutRooms({ db, staffId }: { db: Database; staffId: string }) {
  const checkoutResult = await db.from("checkout_rooms").select("id", { count: "exact", head: true })
    .eq("assigned_to", staffId).eq("status", "rectification").is("deleted_at", null);
  const pendingCheckouts = checkoutResult.count ?? 0;
  return (pendingCheckouts > 0 || checkoutResult.error) && <section className={followUpStyles.panel} aria-labelledby="staff-checkout-rooms">
      <header className={followUpStyles.header}>
        <div className={followUpStyles.heading}>
          <span className={followUpStyles.icon}><DoorOpen size={20} aria-hidden="true"/></span>
          <div>
            <h2 id="staff-checkout-rooms">Check-out Rooms</h2>
            {checkoutResult.error
              ? <p role="alert">Unable to load your assigned room count.</p>
              : <p>{pendingCheckouts} {pendingCheckouts === 1 ? "room" : "rooms"} assigned to you for rectification.</p>}
          </div>
        </div>
        <Link className={followUpStyles.action} href="/staff/checkouts">Open assigned rooms <ArrowUpRight size={15} aria-hidden="true"/></Link>
      </header>
    </section>;
}
async function Appointments({ db, today }: { db: Database; today: string }) {
  const {data} = await db.from("appointments").select("id,job_id,appointment_date,appointment_time,status,complaint:complaints!complaint_id(room_no,category,complainant_contact,room_access_permission,block:blocks!block_id(code))").eq("appointment_date",today)
    .not("status", "in", '("completed","cancelled","no_show")').order("appointment_time").limit(10);
  const appointments = (data ?? []) as unknown as Array<{id:string;job_id:string|null;appointment_date:string;appointment_time:string;status:string;complaint:{room_no:string;category:string;complainant_contact:string|null;room_access_permission:string|null;block:{code:string}|null}|null}>;
  return !appointments.length?<p className="subtle">No upcoming appointments.</p>:<div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Time</th><th>Block</th><th>Room</th><th>Category</th><th>Room Access Permission</th><th>Resident Phone</th><th>Appointment Status</th></tr></thead><tbody>{appointments.map(a=><tr key={a.id}><td>{a.job_id?<Link className="text-link" href={`/staff/jobs/${a.job_id}`}>{a.appointment_date}</Link>:a.appointment_date}</td><td>{a.appointment_time.slice(0,5)}</td><td>{a.complaint?.block?.code||"—"}</td><td>{a.complaint?.room_no||"—"}</td><td>{a.complaint?.category||"—"}</td><td>{a.complaint?.room_access_permission?.replaceAll("_"," ")||"Not set"}</td><td>{a.complaint?.complainant_contact||"—"}</td><td><span className={`status-badge status-${a.status}`}>{a.status.replaceAll("_"," ")}</span></td></tr>)}</tbody></table></div>;
}
