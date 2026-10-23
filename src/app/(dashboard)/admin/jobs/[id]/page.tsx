import { signEvidencePhotos } from "@/lib/evidence-urls";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PriorityBadge, StatusBadge } from "@/components/phase2-ui";
import { RecordFacts } from "@/components/record-facts";
import { ReporterInformation } from "@/components/reporter-information";
import { MaintenanceAppointment } from "@/components/maintenance-appointment";
import { JobActivityTimeline } from "@/components/job-activity-timeline";
import { requireRole } from "@/lib/auth";
import { buildJobActivity, type AppointmentActivityRow, type JobHistoryRow, type MaterialRequestRow } from "@/lib/job-activity";
import { formatDate, type JobRow } from "@/lib/phase2";
import { createClient } from "@/lib/supabase/server";
import { appointmentStatuses, appointmentTimeSlots, titleCase } from "@/lib/appointments";
import { saveJobAppointment, transferJob } from "../actions";

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
  const [{ data: appointmentRows }, { data: historyRows }, { data: materialRows }, {data:staff}, {data:transfers}, {data:photos,error:photoError}] = await Promise.all([
    supabase.from("appointments").select("id,appointment_date,appointment_time,status,remarks,no_show_remarks,created_at,attended_at,attendee:profiles!appointments_attended_by_fkey(full_name),staff:profiles!appointments_assigned_staff_fkey(full_name)").eq("job_id", id).order("created_at", { ascending: true }),
    supabase.from("job_status_history").select("id,previous_status,new_status,note,created_at,actor:profiles!job_status_history_changed_by_fkey(full_name)").eq("job_id", id).order("created_at", { ascending: true }),
    supabase.from("material_requests").select("id,request_no,status,note,rejection_reason,created_at,reviewed_at,issued_at,requester:profiles!material_requests_requested_by_fkey(full_name),reviewer:profiles!material_requests_reviewed_by_fkey(full_name),issuer:profiles!material_requests_issued_by_fkey(full_name),items:material_request_items!material_request_items_request_id_fkey(other_item_name,requested_qty,approved_qty,issued_qty,item:inventory_items!material_request_items_inventory_item_id_fkey(item_code,description,unit))").eq("job_id", id).order("created_at", { ascending: true }),
    supabase.from("profiles").select("id,full_name,profile_blocks(block_id)").eq("role","maintenance_staff").eq("is_active",true).is("deleted_at",null),
    supabase.from("job_assignment_history").select("id,reason,created_at,previous:profiles!previous_staff(full_name),next:profiles!assigned_staff(full_name),actor:profiles!changed_by(full_name)").eq("job_id",id).order("created_at"),
    supabase.from("maintenance_job_photos").select("id,storage_path,created_at").eq("job_id", id).order("created_at"),
  ]);
  const appointments = (appointmentRows || []) as unknown as AppointmentActivityRow[];
  const appointment = appointments.filter(({ status }) => !["cancelled", "no_show"].includes(status)).at(-1) ?? null;
  const events = buildJobActivity({ job, history: (historyRows || []) as unknown as JobHistoryRow[], materials: (materialRows || []) as unknown as MaterialRequestRow[], appointments });
  const relationName = (value: unknown) => (value as {full_name?:string}|null)?.full_name || "Unknown";
  for (const transfer of transfers || []) events.push({id:`transfer-${transfer.id}`,timestamp:transfer.created_at,action:"Job Transferred",actor:relationName(transfer.actor),remarks:`${relationName(transfer.previous)} → ${relationName(transfer.next)} · ${transfer.reason}`});
  if (transfers?.length) { const initial = events.find(event => event.id === "job-assigned"); if (initial) initial.actor = relationName(transfers[0].previous); }
  events.sort((a,b) => new Date(a.timestamp).getTime()-new Date(b.timestamp).getTime());
  const completedEvents = events.filter(event => event.action === "Completed");
  const signedPhotos = await signEvidencePhotos(supabase, "maintenance-evidence", photos || []);
  const photoLoadFailed = Boolean(photoError) || signedPhotos.some(photo => photo.signError);
  for (const photo of signedPhotos) {
    const event = completedEvents.find(event => new Date(event.timestamp).getTime() >= new Date(photo.created_at).getTime()) ?? completedEvents.at(-1);
    if (photo.url && event) (event.photos ??= []).push({id:photo.id,url:photo.url});
  }

  return <AppShell profile={profile} title="Maintenance Job Detail"><div className="compact-record-page case-workspace job-workspace">
    <div className="section-head"><div><p className="eyebrow">{job.job_no}</p><h2>Block {job.block?.code} · {job.room_no}</h2><p className="subtle">Assigned {formatDate(job.assigned_at)}</p></div><div className="actions"><PriorityBadge value={job.priority}/><StatusBadge value={job.status}/></div></div>
    <RecordFacts className="case-primary" title="Job Details" facts={[
      {label:"Job No.",value:job.job_no},
      {label:"Complaint",value:job.complaint?.complaint_no},
      {label:"Block",value:job.block ? `Block ${job.block.code}` : "External Area"},
      {label:"Room / Location",value:job.room_no},
      {label:"Category",value:job.category},
      {label:"Assigned Staff",value:job.assignee?.full_name || "—"},
      {label:"Status",value:<StatusBadge value={job.status}/>},
      {label:"Priority",value:<PriorityBadge value={job.priority}/>},
      {label:"Assigned",value:formatDate(job.assigned_at)},
      {label:"Started",value:job.started_at ? formatDate(job.started_at) : "—"},
      {label:"Completed",value:job.completed_at ? formatDate(job.completed_at) : "—"},
      {label:"Last Updated",value:job.updated_at ? formatDate(job.updated_at) : "—"},
      {label:"Description / Defect",value:job.description,wide:true},
      ...(job.action_taken ? [{label:"Action Taken",value:job.action_taken,wide:true}] : []),
      ...(job.pending_material_note ? [{label:"Pending Material Note",value:job.pending_material_note,wide:true}] : []),
      ...(job.monitoring_note ? [{label:"Monitoring Note",value:job.monitoring_note,wide:true}] : []),
    ]}/>

    <ReporterInformation compact className="case-reporter" name={job.complaint?.reporter_name||job.complaint?.complainant_name} phone={job.complaint?.reporter_phone||job.complaint?.complainant_contact} email={job.complaint?.reporter_email} availabilityDate={job.complaint?.availability_date} availabilityTime={job.complaint?.availability_time} roomAccessPermission={job.complaint?.room_access_permission}/>
    {message.error&&<p className="error">{message.error}</p>}{message.appointment&&<p className="success">Appointment saved.</p>}
    <MaintenanceAppointment compact appointment={appointment}/>
    {appointments.some(({status})=>status==="no_show")&&<section className="panel record-history"><h3>Appointment History</h3><div className="table-wrap"><table className="table record-history-table"><thead><tr><th>Appointment</th><th>Attendance / No-Show Time</th><th>Recorded by</th><th>No-Show Remarks</th></tr></thead><tbody>{appointments.filter(({status})=>status==="no_show").map(past=><tr key={past.id}><td>No Show · {past.appointment_date} {past.appointment_time.slice(0,5)}</td><td>{past.attended_at?formatDate(past.attended_at):"—"}</td><td>{past.attendee?.full_name||"—"}</td><td>{past.no_show_remarks||"—"}</td></tr>)}</tbody></table></div></section>}
    {photoLoadFailed && <p className="error">Some completion photos could not be loaded. Please refresh and try again.</p>}

{profile.role==="admin"&&<section className="panel assignment-panel record-action case-appointment"><h3 className="case-action-title">{appointment?"Manage / Reschedule Appointment":"Add Appointment"}</h3><p className="subtle">Schedule the maintenance visit without changing the reporter&apos;s preferred availability or room access response.</p><form action={saveJobAppointment.bind(null,id,appointment?.id??null)} className="form-grid"><label className="field"><span>Maintenance Date *</span><input name="appointmentDate" type="date" defaultValue={appointment?.appointment_date} required/></label><label className="field"><span>Maintenance Time *</span><select name="appointmentTime" defaultValue={appointment?.appointment_time?.slice(0,5)||""} required><option value="" disabled>Choose a time slot</option>{appointmentTimeSlots.map(slot=><option key={slot.value} value={slot.value}>{slot.label}</option>)}</select></label>{appointment&&<label className="field"><span>Status *</span><select name="status" defaultValue={appointment.status}>{appointmentStatuses.map(status=><option key={status} value={status}>{titleCase(status)}</option>)}</select></label>}<label className="field field-wide"><span>Remarks</span><textarea name="remarks" rows={3} maxLength={1000} defaultValue={appointment?.remarks||""}/></label><div className="field-wide"><button className="button">{appointment?"Save / Reschedule Appointment":"Add Appointment"}</button></div></form></section>}
    {profile.role === "admin" && !["completed","cancelled"].includes(job.status) && <section className="panel record-action case-transfer"><h3 className="case-action-title">Transfer task</h3><form action={transferJob.bind(null,id)} className="form-grid"><label className="field">Assign to<select name="staffId" required defaultValue=""><option value="">Choose employee</option>{staff?.filter(person => person.id !== job.assignee?.id && person.profile_blocks.some(block => block.block_id === job.block?.id)).map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label><label className="field">Reason<input name="reason" required maxLength={1000}/></label><button className="button">Transfer task</button></form></section>}
    <JobActivityTimeline compact events={events}/>  </div></AppShell>;
}
