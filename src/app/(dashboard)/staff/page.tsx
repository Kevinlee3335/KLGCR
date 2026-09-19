import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { JobList } from "@/components/phase2-ui";
import { createClient } from "@/lib/supabase/server";
import type { JobRow } from "@/lib/phase2";

export default async function StaffPage() {
  const profile = await requireRole(["maintenance_staff"]);
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date());
  const [statusResult, recentResult, appointmentResult, checkoutResult] = await Promise.all([
    supabase.from("maintenance_jobs").select("status"),
    supabase.from("maintenance_jobs").select("id,job_no,room_no,category,description,priority,status,assigned_at,updated_at,complaint:complaints!complaint_id(id,complaint_no,availability_date,availability_time,room_access_permission),block:blocks!block_id(id,code)").order("assigned_at", { ascending: false }).limit(5),
    supabase.from("appointments").select("id,job_id,appointment_date,appointment_time,status,complaint:complaints!complaint_id(room_no,category,complainant_contact,availability_date,availability_time,room_access_permission,block:blocks!block_id(code))").eq("appointment_date",today).not("status","in",'("completed","cancelled","no_show")').order("appointment_date").order("appointment_time").limit(10),
    supabase.from("checkout_rooms").select("id", { count: "exact", head: true }).eq("assigned_to", profile.id).neq("status", "ready_for_occupancy"),
  ]);
  const statuses = statusResult.data || [];
  const jobs = (recentResult.data || []) as unknown as JobRow[];
  const complaintIds = [...new Set(jobs.map((job) => job.complaint?.id).filter((id): id is string => Boolean(id)))];
  const appointmentsByComplaint = new Map<string, NonNullable<JobRow["appointments"]>>();
  if (complaintIds.length) {
    const { data: jobAppointments } = await supabase.from("appointments").select("complaint_id,appointment_date,appointment_time,status").in("complaint_id", complaintIds);
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
  const dashboardHrefs = ["/staff/tasks?status=assigned", "/staff/tasks?status=in_progress", "/staff/tasks?status=pending_material", "/staff/tasks?status=completed"];

  return <AppShell profile={profile} title="My Dashboard">
    <Dashboard kind="staff" name={profile.full_name} blocks={blocks} values={[count("assigned"), count("in_progress"), count("pending_material"), count("completed")]} hrefs={dashboardHrefs}/>
    <section className="staff-dashboard-shortcuts">
      <Link className="panel staff-shortcut-card" href="/staff/appointments"><span>Appointments Today</span><strong>{appointments.length}</strong><small>Open today&apos;s scheduled visits</small></Link>
      <Link className="panel staff-shortcut-card" href="/staff/checkouts"><span>Check-out Rooms</span><strong>{checkoutResult.count || 0}</strong><small>View assigned room rectifications</small></Link>
    </section>
    <section className="panel" style={{marginTop:24}}><div className="section-head"><div><h2>Today&apos;s Appointments</h2><p className="subtle">Scheduled maintenance visits assigned to you.</p></div><Link className="text-link" href="/staff/appointments">View details</Link></div>{!appointments.length?<p className="subtle">No upcoming appointments today.</p>:<div className="mobile-cards" style={{display:"grid"}}>{appointments.map(a=><Link className="panel record-card" href={a.job_id?`/staff/jobs/${a.job_id}`:"/staff/appointments"} key={a.id}><div className="record-head"><strong>{a.appointment_time.slice(0,5)}</strong><span className={`status-badge status-${a.status}`}>{a.status.replaceAll("_"," ")}</span></div><h3>Block {a.complaint?.block?.code||"—"} · Room {a.complaint?.room_no||"—"}</h3><p>{a.complaint?.category||"—"}</p><small>Room access: {a.complaint?.room_access_permission?.replaceAll("_"," ")||"Not set"}</small></Link>)}</div>}</section>
    <div className="section-head tasks-head"><h2>Maintenance Jobs</h2><Link className="text-link" href="/staff/tasks">View current tasks</Link></div>
    <section className="panel list-panel">{recentResult.error ? <p className="error">{recentResult.error.message}</p> : <JobList rows={rows} staff compact/>}</section>
  </AppShell>;
}
