import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function myDate() { return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); }

export default async function DailyTasksPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const profile = await requireRole(["admin","management_viewer"]);
  const filters = await searchParams;
  const date = filters.date || myDate();
  const supabase = await createClient();
  const { data: jobs, error } = await supabase.from("maintenance_jobs").select("id,job_no,room_no,category,status,scheduled_for,block:blocks!block_id(code),assignee:profiles!assigned_to(full_name)").not("status","in",'("completed","cancelled")').order("scheduled_for",{ascending:true,nullsFirst:false}).order("assigned_at",{ascending:true});
  const isAdmin = profile.role === "admin";
  const rows = (jobs ?? []) as unknown as Array<{id:string;job_no:string;room_no:string;category:string;status:string;scheduled_for:string|null;block:{code:string}|null;assignee:{full_name:string}|null}>;
  const today = rows.filter(r=>r.scheduled_for===date);
  const unscheduled = rows.filter(r=>!r.scheduled_for);
  return <AppShell profile={profile} title="Daily Tasks"><div className="section-head"><div><h2>Daily Task Schedule</h2><p className="subtle">Schedule approved jobs for a working day. The 9AM report uses this list.</p></div><form><input type="date" name="date" defaultValue={date}/><button className="button secondary" style={{marginLeft:8}}>View</button></form></div>
    {error && <p className="error">{error.message}</p>}
    <section className="panel"><h3>{date} · Scheduled Tasks ({today.length})</h3>{!today.length?<p className="subtle">No jobs scheduled for this date.</p>:<div className="table-wrap"><table className="table"><thead><tr><th>Job</th><th>Room</th><th>Category</th><th>Staff</th><th>Status</th><th>Schedule</th></tr></thead><tbody>{today.map(j=><tr key={j.id}><td>{j.job_no}</td><td>Block {j.block?.code} {j.room_no}</td><td>{j.category}</td><td>{j.assignee?.full_name}</td><td>{j.status.replaceAll("_"," ")}</td><td>{isAdmin?<form action="/admin/daily-tasks/action" method="post" className="actions"><input type="hidden" name="jobId" value={j.id}/><input type="date" name="date" defaultValue={j.scheduled_for ?? date}/><button className="button secondary">Change</button></form>:j.scheduled_for}</td></tr>)}</tbody></table></div>}</section>
    <section className="panel" style={{marginTop:18}}><h3>Unscheduled Active Jobs ({unscheduled.length})</h3>{!unscheduled.length?<p className="subtle">All active jobs have a schedule.</p>:<div className="table-wrap"><table className="table"><thead><tr><th>Job</th><th>Room</th><th>Category</th><th>Staff</th><th>Status</th><th>Add to Day</th></tr></thead><tbody>{unscheduled.map(j=><tr key={j.id}><td>{j.job_no}</td><td>Block {j.block?.code} {j.room_no}</td><td>{j.category}</td><td>{j.assignee?.full_name}</td><td>{j.status.replaceAll("_"," ")}</td><td>{isAdmin?<form action="/admin/daily-tasks/action" method="post" className="actions"><input type="hidden" name="jobId" value={j.id}/><input type="date" name="date" defaultValue={date}/><button className="button">Schedule</button></form>:"Admin only"}</td></tr>)}</tbody></table></div>}</section>
  </AppShell>;
}
