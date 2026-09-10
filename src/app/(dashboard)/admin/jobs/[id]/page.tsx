import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PriorityBadge, StatusBadge } from "@/components/phase2-ui";
import { ReporterInformation } from "@/components/reporter-information";
import { MaintenanceAppointment } from "@/components/maintenance-appointment";
import { JobActivityTimeline } from "@/components/job-activity-timeline";
import { requireRole } from "@/lib/auth";
import { buildJobActivity, type AppointmentActivityRow, type JobHistoryRow, type MaterialRequestRow } from "@/lib/job-activity";
import { formatDate, type JobRow } from "@/lib/phase2";
import { createClient } from "@/lib/supabase/server";

export default async function AdminJobDetail({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("maintenance_jobs")
    .select("id,job_no,room_no,category,description,priority,status,assigned_at,updated_at,started_at,completed_at,action_taken,monitoring_note,monitoring_started_at,monitoring_review_at,pending_material_note,block:blocks!block_id(id,code),assignee:profiles!assigned_to(id,full_name),complaint:complaints!complaint_id(complaint_no,complainant_name,complainant_contact,availability_date,availability_time,room_access_permission,submitted_at,reviewed_at,reviewer:profiles!reviewed_by(full_name))")
    .eq("id", id).maybeSingle();
  if (error) throw new Error(`Unable to load maintenance job: ${error.message}`);
  if (!data) notFound();
  const job = data as unknown as JobRow;
  const [{ data: appointmentRows }, { data: historyRows }, { data: materialRows }] = await Promise.all([
    supabase.from("appointments").select("id,appointment_date,appointment_time,status,remarks,created_at,staff:profiles!appointments_assigned_staff_fkey(full_name)").eq("job_id", id).order("created_at", { ascending: true }),
    supabase.from("job_status_history").select("id,previous_status,new_status,note,created_at,actor:profiles!job_status_history_changed_by_fkey(full_name)").eq("job_id", id).order("created_at", { ascending: true }),
    supabase.from("material_requests").select("id,request_no,status,note,rejection_reason,created_at,reviewed_at,issued_at,requester:profiles!material_requests_requested_by_fkey(full_name),reviewer:profiles!material_requests_reviewed_by_fkey(full_name),issuer:profiles!material_requests_issued_by_fkey(full_name),items:material_request_items!material_request_items_request_id_fkey(requested_qty,approved_qty,issued_qty,item:inventory_items!material_request_items_inventory_item_id_fkey(item_code,description,unit))").eq("job_id", id).order("created_at", { ascending: true }),
  ]);
  const appointments = (appointmentRows || []) as unknown as AppointmentActivityRow[];
  const appointment = appointments.filter(({ status }) => !["cancelled", "no_show"].includes(status)).at(-1) ?? null;
  const events = buildJobActivity({ job, history: (historyRows || []) as unknown as JobHistoryRow[], materials: (materialRows || []) as unknown as MaterialRequestRow[], appointments });

  return <AppShell profile={profile} title="Maintenance Job Detail">
    <div className="section-head"><div><p className="eyebrow">{job.job_no}</p><h2>Block {job.block?.code} · {job.room_no}</h2><p className="subtle">Assigned {formatDate(job.assigned_at)}</p></div><div className="actions"><PriorityBadge value={job.priority}/><StatusBadge value={job.status}/></div></div>
    <section className="panel detail-grid" style={{marginBottom:18}}><div><span>Complaint</span><strong>{job.complaint?.complaint_no}</strong></div><div><span>Assigned Staff</span><strong>{job.assignee?.full_name||"—"}</strong></div><div><span>Category</span><strong>{job.category}</strong></div><div className="field-wide"><span>Description</span><p>{job.description}</p></div></section>
    <ReporterInformation name={job.complaint?.complainant_name} phone={job.complaint?.complainant_contact} availabilityDate={job.complaint?.availability_date} availabilityTime={job.complaint?.availability_time} roomAccessPermission={job.complaint?.room_access_permission}/>
    <MaintenanceAppointment appointment={appointment}/>
    <JobActivityTimeline events={events}/>
  </AppShell>;
}
