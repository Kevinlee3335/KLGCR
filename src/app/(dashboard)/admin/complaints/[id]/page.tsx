import { notFound } from "next/navigation";
import { RejectComplaintForm } from "@/components/reject-complaint-form";
import { AppShell } from "@/components/app-shell";
import { AssignmentForm, ComplaintForm } from "@/components/complaint-form";
import { StatusBadge, PriorityBadge } from "@/components/phase2-ui";
import { requireRole } from "@/lib/auth";
import { formatDate, type ComplaintRow } from "@/lib/phase2";
import { createClient } from "@/lib/supabase/server";
import { createAppointment, updateAppointment } from "../actions";
import { roomAccessOptions, appointmentStatuses, titleCase } from "@/lib/appointments";

export default async function ComplaintDetail({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<{error?:string;saved?:string;appointment?:string}> }) {
  const profile = await requireRole(["admin"]);
  const { id } = await params;
  const q = await searchParams;
  const s = await createClient();
  // Load the established complaint shape first. Keeping appointment fields out of
  // this query means an optional relationship (or a pending migration) can never
  // make an existing complaint look missing and incorrectly trigger a 404.
  const { data, error: complaintError } = await s.from("complaints").select("id,complaint_no,source,source_reference,photo_url,room_no,complainant_name,complainant_contact,category,description,priority,status,submitted_at,assigned_at,block:blocks!block_id(id,code),assignee:profiles!assigned_to(id,full_name)").eq("id",id).maybeSingle();
  if (complaintError) throw new Error(`Unable to load complaint: ${complaintError.message}`);
  if (!data) notFound();
  const complaint = data as unknown as ComplaintRow;
  const source = data as unknown as { photo_url:string|null; source_reference:string|null };
  const [{data:blocks},{data:eligible},{data:appointmentData,error:appointmentError}] = await Promise.all([
    s.from("blocks").select("id,code").eq("is_active",true).order("code"),
    complaint.block ? s.from("profiles").select("id,full_name,profile_blocks!inner(block_id)").eq("role","maintenance_staff").eq("is_active",true).eq("profile_blocks.block_id",complaint.block.id) : Promise.resolve({data:[]}),
    // Supabase embedded relations are LEFT JOINs by default. An existing
    // complaint therefore returns with appointments: [] when none are present.
    s.from("complaints").select("preferred_date,preferred_time,need_appointment,room_access_permission,appointments(id,appointment_date,appointment_time,remarks,status,created_at,staff:profiles!assigned_staff(full_name))").eq("id",id).maybeSingle(),
  ]);
  if (appointmentError) console.error("Optional appointment data could not be loaded", appointmentError.message);
  const extra = appointmentData ?? {preferred_date:null,preferred_time:null,need_appointment:false,room_access_permission:null,appointments:[]};
  const appointments = [...(extra.appointments ?? [])].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  return <AppShell profile={profile} title="Complaint Review"><div className="section-head"><div><p className="eyebrow">{complaint.complaint_no}</p><h2>Block {complaint.block?.code} · {complaint.room_no}</h2><p className="subtle">Submitted {formatDate(complaint.submitted_at)}</p></div><div className="actions"><PriorityBadge value={complaint.priority}/><StatusBadge value={complaint.status}/></div></div>{q.error&&<p className="error">{q.error}</p>}{q.saved&&<p className="success">Review changes saved.</p>}{q.appointment&&<p className="success">Appointment saved.</p>}
  <section className="panel detail-grid" style={{marginBottom:18}}><div className="field-wide"><h3>Student Availability</h3></div><div><span>Student Name</span><strong>{complaint.complainant_name||"—"}</strong></div><div><span>Phone</span><strong>{complaint.complainant_contact||"—"}</strong></div><div><span>Preferred Date</span><strong>{extra.preferred_date||"—"}</strong></div><div><span>Preferred Time</span><strong>{extra.preferred_time?.slice(0,5)||"—"}</strong></div><div><span>Need Appointment</span><strong>{extra.need_appointment?"Yes":"No"}</strong></div><div><span>Room Access Permission</span><strong>{extra.room_access_permission?titleCase(extra.room_access_permission):"Not set"}</strong></div></section>
  {(source.photo_url||source.source_reference)&&<section className="panel" style={{marginBottom:18}}><h3>Google Form Source</h3>{source.source_reference&&<p><strong>Response:</strong> {source.source_reference}</p>}{source.photo_url&&<p><a className="text-link" href={source.photo_url} target="_blank" rel="noreferrer">Open Google Drive Photo / Attachment ↗</a></p>}</section>}<ComplaintForm blocks={blocks||[]} complaint={complaint} mode="review"/>{!["assigned","rejected","closed"].includes(complaint.status)&&<section className="panel assignment-panel"><h3>Approve and assign</h3><p className="subtle">Only active maintenance staff assigned to Block {complaint.block?.code} are available.</p><AssignmentForm complaintId={id} eligible={eligible||[]}/><RejectComplaintForm complaintId={id}/></section>}
  {complaint.status==="assigned"&&<section className="panel assignment-panel"><h3>Create Appointment</h3><p className="subtle">The appointment is automatically added to Daily Tasks and sent to the selected staff member.</p><form action={createAppointment.bind(null,id)} className="form-grid"><div className="field"><label>Appointment Date</label><input name="appointmentDate" type="date" defaultValue={extra.preferred_date||""} required/></div><div className="field"><label>Appointment Time</label><input name="appointmentTime" type="time" defaultValue={extra.preferred_time?.slice(0,5)||""} required/></div><div className="field"><label>Assigned Staff</label><select name="staffId" defaultValue={complaint.assignee?.id||""} required><option value="">Choose staff</option>{eligible?.map(x=><option key={x.id} value={x.id}>{x.full_name}</option>)}</select></div><div className="field"><label>Room Access Permission</label><select name="roomAccess" defaultValue={extra.room_access_permission||"need_appointment"}>{roomAccessOptions.map(x=><option key={x} value={x}>{titleCase(x)}</option>)}</select></div><div className="field"><label>Appointment Status</label><select name="status" defaultValue="pending_confirmation">{appointmentStatuses.map(x=><option key={x} value={x}>{titleCase(x)}</option>)}</select></div><div className="field field-wide"><label>Appointment Remarks</label><textarea name="remarks" rows={3}/></div><div><button className="button">Create Appointment</button></div></form></section>}
  <section className="panel assignment-panel"><h3>Appointment Details</h3>{!appointments.length?<p className="subtle">No appointment scheduled</p>:<div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Time</th><th>Assigned Staff</th><th>Remarks</th><th>Appointment Status</th></tr></thead><tbody>{appointments.map(a=><tr key={a.id}><td>{a.appointment_date}</td><td>{a.appointment_time.slice(0,5)}</td><td>{(a.staff as unknown as {full_name:string}|null)?.full_name||"—"}</td><td>{a.remarks||"—"}</td><td><form action={updateAppointment.bind(null,id,a.id)} className="actions"><select name="status" defaultValue={a.status}>{appointmentStatuses.map(x=><option key={x} value={x}>{titleCase(x)}</option>)}</select><button className="button secondary">Update</button></form></td></tr>)}</tbody></table></div>}</section></AppShell>;
}
