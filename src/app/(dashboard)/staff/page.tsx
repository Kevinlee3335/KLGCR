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
  const [statusResult, recentResult, appointmentResult] = await Promise.all([
    supabase.from("maintenance_jobs").select("status,complaint:complaints!complaint_id(appointment_required)"),
    supabase.from("maintenance_jobs").select("id,job_no,room_no,category,description,priority,status,assigned_at,updated_at,complaint:complaints!complaint_id(appointment_required),block:blocks!block_id(id,code)").order("assigned_at", { ascending: false }).limit(5),
    supabase.from("appointments").select("id,job_id,appointment_date,appointment_time,status,complaint:complaints!complaint_id(room_no,category,complainant_contact,room_access_permission,block:blocks!block_id(code))").eq("appointment_date",today).not("status","in",'("completed","cancelled","no_show")').order("appointment_date").order("appointment_time").limit(10),
  ]);
  const statuses = (statusResult.data || []).filter((row) => !(row.complaint as unknown as {appointment_required:boolean}|null)?.appointment_required);
  const rows = (recentResult.data || []).filter((row) => !(row.complaint as unknown as {appointment_required:boolean}|null)?.appointment_required) as unknown as JobRow[];
  const blocks = profile.blocks?.map((block) => `Block ${block.code}`).join(" & ");
  const count = (status: string) => statuses.filter((row) => row.status === status).length;
  const appointments=(appointmentResult.data||[]) as unknown as Array<{id:string;job_id:string|null;appointment_date:string;appointment_time:string;status:string;complaint:{room_no:string;category:string;complainant_contact:string|null;room_access_permission:string|null;block:{code:string}|null}|null}>;
  return <AppShell profile={profile} title="My Dashboard"><Dashboard kind="staff" name={profile.full_name} blocks={blocks} values={[count("assigned"), count("in_progress"), count("pending_material"), count("completed")]}/><section className="panel" style={{marginTop:24}}><div className="section-head"><div><h2>Today&apos;s Appointments</h2><p className="subtle">Visits where the tenant must be present.</p></div></div>{!appointments.length?<p className="subtle">No upcoming appointments.</p>:<div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Time</th><th>Block</th><th>Room</th><th>Category</th><th>Room Access Permission</th><th>Resident Phone</th><th>Appointment Status</th></tr></thead><tbody>{appointments.map(a=><tr key={a.id}><td>{a.job_id?<Link className="text-link" href={`/staff/jobs/${a.job_id}`}>{a.appointment_date}</Link>:a.appointment_date}</td><td>{a.appointment_time.slice(0,5)}</td><td>{a.complaint?.block?.code||"—"}</td><td>{a.complaint?.room_no||"—"}</td><td>{a.complaint?.category||"—"}</td><td>{a.complaint?.room_access_permission?.replaceAll("_"," ")||"Not set"}</td><td>{a.complaint?.complainant_contact||"—"}</td><td><span className={`status-badge status-${a.status}`}>{a.status.replaceAll("_"," ")}</span></td></tr>)}</tbody></table></div>}</section><div className="section-head tasks-head"><h2>Maintenance Jobs</h2><Link className="text-link" href="/staff/tasks">View current tasks</Link></div><section className="panel list-panel">{recentResult.error ? <p className="error">{recentResult.error.message}</p> : <JobList rows={rows} staff compact/>}</section></AppShell>;
}
