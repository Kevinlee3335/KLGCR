import { AppShell } from "@/components/app-shell";
import { JobList } from "@/components/phase2-ui";
import { requireRole } from "@/lib/auth";
import { jobStatuses, titleCase, type JobRow } from "@/lib/phase2";
import { createClient } from "@/lib/supabase/server";

export default async function Tasks({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const profile = await requireRole(["maintenance_staff"]);
  const filters = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("maintenance_jobs").select("id,job_no,room_no,category,description,priority,status,assigned_to,assigned_at,updated_at,complaint:complaints!complaint_id(id,complaint_no,availability_date,availability_time,room_access_permission),block:blocks!block_id(id,code)").order("assigned_at", { ascending: false });
  query = filters.status ? query.eq("status", filters.status) : query.in("status", ["assigned", "in_progress"]);
  const { data, error } = await query;
  const jobs = (data || []) as unknown as JobRow[];
  const complaintIds = [...new Set(jobs.map((job) => job.complaint?.id).filter((id): id is string => Boolean(id)))];
  const appointmentsByComplaint = new Map<string, NonNullable<JobRow["appointments"]>>();
  if (complaintIds.length) {
    const { data: appointments } = await supabase.from("appointments")
      .select("complaint_id,appointment_date,appointment_time,status")
      .in("complaint_id", complaintIds);
    for (const appointment of appointments || []) {
      const existing = appointmentsByComplaint.get(appointment.complaint_id) || [];
      existing.push(appointment);
      appointmentsByComplaint.set(appointment.complaint_id, existing);
    }
  }
  const maintenanceJobs = jobs.map((job) => ({ ...job, appointments: job.complaint?.id ? appointmentsByComplaint.get(job.complaint.id) || [] : [] }));
  return <AppShell profile={profile} title="Maintenance Reports"><div className="section-head"><div><h2>{filters.status ? titleCase(filters.status) : "Current maintenance reports"}</h2><p className="subtle">All maintenance staff can view every report. Only the assigned staff member can update a job.</p></div></div><form className="panel filter-bar"><select name="status" defaultValue={filters.status || ""}><option value="">Current reports</option>{jobStatuses.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select><button className="button">Filter</button></form><section className="panel list-panel">{error ? <p className="error">{error.message}</p> : <JobList rows={maintenanceJobs} staff viewerId={profile.id} returnTo={filters.status ? `/staff/tasks?status=${filters.status}` : "/staff/tasks"}/>}</section></AppShell>;
}
