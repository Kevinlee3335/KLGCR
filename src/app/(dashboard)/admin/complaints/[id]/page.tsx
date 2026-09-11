import { notFound } from "next/navigation";
import { RejectComplaintForm } from "@/components/reject-complaint-form";
import { AppShell } from "@/components/app-shell";
import { AssignmentForm, ComplaintForm } from "@/components/complaint-form";
import { StatusBadge, PriorityBadge } from "@/components/phase2-ui";
import { requireRole } from "@/lib/auth";
import { formatDate, type ComplaintRow } from "@/lib/phase2";
import { createClient } from "@/lib/supabase/server";
import { appointmentRequired } from "@/lib/appointments";
import { ReporterInformation } from "@/components/reporter-information";

export default async function ComplaintDetail({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<{error?:string;saved?:string;appointment?:string}> }) {
  const profile = await requireRole(["admin"]);
  const { id } = await params;
  const q = await searchParams;
  const s = await createClient();
  // Keep optional appointment/availability fields out of the primary lookup.
  // A PostgREST error for one of those fields must not prevent an otherwise
  // valid complaint from loading.
  const { data, error: complaintError } = await s.from("complaints").select("id,complaint_no,source,source_reference,photo_url,room_no,complainant_name,complainant_contact,category,description,priority,status,submitted_at,assigned_at,availability_date,availability_time,room_access_permission,block:blocks!block_id(id,code),assignee:profiles!assigned_to(id,full_name)").eq("id",id).maybeSingle();
  if (complaintError) throw new Error(`Unable to load complaint: ${complaintError.message}`);
  if (!data) notFound();
  const complaint = data as unknown as ComplaintRow;
  const source = data as unknown as { photo_url:string|null; source_reference:string|null };
  const [{data:blocks},{data:eligible},{data:availabilityData,error:availabilityError}] = await Promise.all([
    s.from("blocks").select("id,code").eq("is_active",true).order("code"),
    complaint.block ? s.from("profiles").select("id,full_name,profile_blocks!inner(block_id)").eq("role","maintenance_staff").eq("is_active",true).eq("profile_blocks.block_id",complaint.block.id) : Promise.resolve({data:[]}),
    s.from("complaints").select("preferred_date,preferred_time,availability_date,availability_time,reporter_phone,room_access_permission").eq("id",id).maybeSingle(),
  ]);
  if (availabilityError) console.error("Optional complaint availability data could not be loaded", availabilityError.message);
  const extra = availabilityData ?? {preferred_date:null,preferred_time:null,availability_date:null,availability_time:null,reporter_phone:null,room_access_permission:null};
  // Room access is the workflow decision in V4. Derive the UI from the answer
  // from the primary complaint when the optional-field lookup is unavailable.
  // The primary lookup always includes this workflow-critical field.
  const roomAccessPermission = extra.room_access_permission ?? complaint.room_access_permission;
  const requiresAppointment = appointmentRequired(roomAccessPermission);
  return <AppShell profile={profile} title="Complaint Review"><div className="section-head"><div><p className="eyebrow">{complaint.complaint_no}</p><h2>Block {complaint.block?.code} · {complaint.room_no}</h2><p className="subtle">Submitted {formatDate(complaint.submitted_at)}</p></div><div className="actions"><PriorityBadge value={complaint.priority}/><StatusBadge value={complaint.status}/></div></div>{q.error&&<p className="error">{q.error}</p>}{q.saved&&<p className="success">Review changes saved.</p>}{q.appointment&&<p className="success">Appointment saved.</p>}
  <ReporterInformation name={complaint.complainant_name} phone={extra.reporter_phone||complaint.complainant_contact} availabilityDate={extra.availability_date??complaint.availability_date} availabilityTime={extra.availability_time??complaint.availability_time} roomAccessPermission={roomAccessPermission}/>
  <aside className={`workflow-notice ${requiresAppointment?"workflow-warning":"workflow-success"}`}><strong>{requiresAppointment?"TENANT MUST BE PRESENT":"ROOM ACCESS GRANTED"}</strong><span>{requiresAppointment?"Appointment Required.":"Maintenance staff may enter without the student. Scheduling a visit is optional."}</span></aside>
  {(source.photo_url||source.source_reference)&&<section className="panel" style={{marginBottom:18}}><h3>Google Form Source</h3>{source.source_reference&&<p><strong>Response:</strong> {source.source_reference}</p>}{source.photo_url&&<p><a className="text-link" href={source.photo_url} target="_blank" rel="noreferrer">Open Google Drive Photo / Attachment ↗</a></p>}</section>}<ComplaintForm blocks={blocks||[]} complaint={complaint} mode="review"/>{!["assigned","rejected","closed"].includes(complaint.status)&&<section className="panel assignment-panel"><h3>Approve and assign</h3><p className="subtle">Only active maintenance staff assigned to Block {complaint.block?.code} are available.</p><AssignmentForm complaintId={id} eligible={eligible||[]} requiresAppointment={requiresAppointment}/><RejectComplaintForm complaintId={id}/></section>}
  </AppShell>;
}
