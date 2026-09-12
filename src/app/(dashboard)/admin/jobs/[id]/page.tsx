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
import { appointmentStatuses, appointmentTimeSlots, titleCase } from "@/lib/appointments";
import { saveJobAppointment } from "../actions";

export default async function AdminJobDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{error?:string;appointment?:string}> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const { id } = await params;
  const message: {error?:string;appointment?:string} = await (searchParams ?? Promise.resolve({}));
  const supabase = await createClient();
  const { data, error } = await supabase.from("maintenance_jobs")
    .select("id,job_no,room_no,category,description,priority,status,assigned_at,updated_at,started_at,completed_at,action_taken,monitoring_note,monitoring_started_at,monitoring_review_at,pending_material_note,block:blocks!block_id(id,code),assignee:profiles!assigned_to(id,full_name),complaint:complaints!complaint_id(complaint_no,complainant_name,complainant_contact,reporter_name,reporter_phone,reporter_email,availability_date,availability_time,room_access_permission,submitted_at,reviewed_at,reviewer:profiles!reviewed_by(full_name))")
    .eq("id", id).maybeSingle();
  if (error) throw new Error(`Unable to load maintenance job: ${error.message}`);
  if (!data) notFound();
  const job = data as unknown as JobRow;
  const [{ data: appointmentRows }, { data: historyRows }, { data: materialRows }] = await Promise.all([
    supabase.from("appointments").select("id,appointment_date,appointment_time,status,remarks,no_show_remarks,created_at,attended_at,attendee:profiles!appointments_attended_by_fkey(full_name),staff:profiles!appointments_assigned_staff_fkey(full_name)").eq("job_id", id).order("created_at", { ascending: true }),
    supabase.from("job_status_history").select("id,previous_status,new_status,note,created_at,actor:profiles!job_status_history_changed_by_fkey(full_name)").eq("job_id", id).order("created_at", { ascending: true }),
    supabase.from("material_requests").select("id,request_no,status,note,rejection_reason,created_at,reviewed_at,issued_at,requester:profiles!material_requests_requested_by_fkey(full_name),reviewer:profiles!material_requests_reviewed_by_fkey(full_name),issuer:profiles!material_requests_issued_by_fkey(full_name),items:material_request_items!material_request_items_request_id_fkey(requested_qty,approved_qty,issued_qty,item:inventory_items!material_request_items_inventory_item_id_fkey(item_code,description,unit))").eq("job_id", id).order("created_at", { ascending: true }),
  ]);
  const appointments = (appointmentRows || []) as unknown as AppointmentActivityRow[];
  const appointment = appointments.filter(({ status }) => !["cancelled", "no_show"].includes(status)).at(-1) ?? null;
  const events = buildJobActivity({ job, history: (historyRows || []) as unknown as JobHistoryRow[], materials: (materialRows || []) as unknown as MaterialRequestRow[], appointments });

  return <AppShell profile={profile} title="Maintenance Job Detail">
    <div className="section-head"><div><p className="eyebrow">{job.job_no}</p><h2>Block {job.block?.code} · {job.room_no}</h2><p className="subtle">Assigned {formatDate(job.assigned_at)}</p></div><div className="actions"><PriorityBadge value={job.priority}/><StatusBadge value={job.status}/></div></div>
    <section className="panel detail-grid" style={{marginBottom:18}}><div><span>Complaint</span><strong>{job.complaint?.complaint_no}</strong></div><div><span>Assigned Staff</span><strong>{job.assignee?.full_name||"—"}</strong></div><div><span>Category</span><strong>{job.category}</strong></div><div className="field-wide"><span>Description</span><p>{job.description}</p></div></section>
    <ReporterInformation name={job.complaint?.reporter_name||job.complaint?.complainant_name} phone={job.complaint?.reporter_phone||job.complaint?.complainant_contact} email={job.complaint?.reporter_email} availabilityDate={job.complaint?.availability_date} availabilityTime={job.complaint?.availability_time} roomAccessPermission={job.complaint?.room_access_permission}/>
    {message.error&&<p className="error">{message.error}</p>}{message.appointment&&<p className="success">Appointment saved.</p>}
    <MaintenanceAppointment appointment={appointment}/>
    {appointments.some(({status})=>status==="no_show")&&<section className="panel list-panel" style={{marginBottom:18}}><h3>Appointment History</h3>{appointments.filter(({status})=>status==="no_show").map((past)=><div className="list-row" key={past.id}><div><strong>No Show · {past.appointment_date} {past.appointment_time.slice(0,5)}</strong><p>Attendance / No-Show Time: {past.attended_at?formatDate(past.attended_at):"—"}</p>{past.attendee?.full_name&&<p>Recorded by: {past.attendee.full_name}</p>}{past.no_show_remarks&&<p>No-Show Remarks: {past.no_show_remarks}</p>}</div></div>)}</section>}
    {profile.role==="admin"&&<section className="panel assignment-panel" style={{marginBottom:18}}><h3>{appointment?"Manage / Reschedule Appointment":"Add Appointment"}</h3><p className="subtle">Schedule the maintenance visit without changing the reporter&apos;s preferred availability or room access response.</p><form action={saveJobAppointment.bind(null,id,appointment?.id??null)} className="form-grid"><label className="field"><span>Maintenance Date *</span><input name="appointmentDate" type="date" defaultValue={appointment?.appointment_date} required/></label><label className="field"><span>Maintenance Time *</span><select name="appointmentTime" defaultValue={appointment?.appointment_time?.slice(0,5)||""} required><option value="" disabled>Choose a time slot</option>{appointmentTimeSlots.map(slot=><option key={slot.value} value={slot.value}>{slot.label}</option>)}</select></label>{appointment&&<label className="field"><span>Status *</span><select name="status" defaultValue={appointment.status}>{appointmentStatuses.map(status=><option key={status} value={status}>{titleCase(status)}</option>)}</select></label>}<label className="field field-wide"><span>Remarks</span><textarea name="remarks" rows={3} maxLength={1000} defaultValue={appointment?.remarks||""}/></label><div className="field-wide"><button className="button">{appointment?"Save / Reschedule Appointment":"Add Appointment"}</button></div></form></section>}
    <JobActivityTimeline events={events}/>
  </AppShell>;
}
