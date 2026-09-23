import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { RejectComplaintForm } from "@/components/reject-complaint-form";
import { AppShell } from "@/components/app-shell";
import { AssignmentForm, ComplaintForm } from "@/components/complaint-form";
import { StatusBadge, PriorityBadge } from "@/components/phase2-ui";
import { requireRole } from "@/lib/auth";
import { formatDate, type ComplaintRow } from "@/lib/phase2";
import { createClient } from "@/lib/supabase/server";
import { complaintAppointmentRequired } from "@/lib/appointments";
import { ReporterInformation } from "@/components/reporter-information";

export default async function ComplaintDetail({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<{error?:string;saved?:string;appointment?:string;assigned?:string}> }) {
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
  let photoHref = source.photo_url;
  if (photoHref?.startsWith("storage://")) {
    const address = photoHref.slice("storage://".length);
    const separator = address.indexOf("/");
    const bucket = separator > 0 ? address.slice(0, separator) : "";
    const path = separator > 0 ? address.slice(separator + 1) : "";
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (bucket && path && url && key) {
      const admin = createSupabaseAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data: signed } = await admin.storage.from(bucket).createSignedUrl(path, 3600);
      photoHref = signed?.signedUrl || null;
    } else photoHref = null;
  }
  const [{data:blocks},{data:eligible},{data:availabilityData,error:availabilityError},{data:existingJobs,error:jobsError}] = await Promise.all([
    s.from("blocks").select("id,code").eq("is_active",true).order("code"),
    complaint.block ? s.from("profiles").select("id,full_name,profile_blocks!inner(block_id)").eq("role","maintenance_staff").eq("is_active",true).eq("profile_blocks.block_id",complaint.block.id) : Promise.resolve({data:[]}),
    s.from("complaints").select("availability_date,availability_time,reporter_phone,reporter_email,reporter_name,room_access_permission").eq("id",id).maybeSingle(),
    s.from("maintenance_jobs").select("id,job_no,description,status,assignee:profiles!assigned_to(full_name)").eq("complaint_id",id).order("created_at",{ascending:true}),
  ]);
  if (jobsError) throw new Error(`Unable to load complaint jobs: ${jobsError.message}`);
  const jobs = (existingJobs || []) as unknown as {id:string;job_no:string;description:string;status:string;assignee:{full_name:string}|null}[];
  if (availabilityError) console.error("Optional complaint availability data could not be loaded", availabilityError.message);
  const extra = availabilityData ?? {availability_date:null,availability_time:null,reporter_phone:null,reporter_email:null,reporter_name:null,room_access_permission:null};
  // Room access is the workflow decision in V4. Derive the UI from the answer
  // from the primary complaint when the optional-field lookup is unavailable.
  // The primary lookup always includes this workflow-critical field.
  const roomAccessPermission = extra.room_access_permission ?? complaint.room_access_permission;
  const requiresAppointment = complaintAppointmentRequired(complaint.source, roomAccessPermission);
  const isManual = complaint.source === "manual";
  return <AppShell profile={profile} title="Complaint Review"><div className="section-head"><div><p className="eyebrow">{complaint.complaint_no}</p><h2>Block {complaint.block?.code} · {complaint.room_no}</h2><p className="subtle">Submitted {formatDate(complaint.submitted_at)}</p></div><div className="actions"><PriorityBadge value={complaint.priority}/><StatusBadge value={complaint.status}/></div></div>{q.error&&<p className="error">{q.error}</p>}{q.saved&&<p className="success">Review changes saved.</p>}{q.appointment&&<p className="success">Appointment saved.</p>}{q.assigned&&<p className="success">Maintenance jobs created.</p>}
  <ReporterInformation name={extra.reporter_name||complaint.complainant_name} phone={extra.reporter_phone||complaint.complainant_contact} email={extra.reporter_email} availabilityDate={extra.availability_date??complaint.availability_date} availabilityTime={extra.availability_time??complaint.availability_time} roomAccessPermission={roomAccessPermission}/>
  <aside className={`workflow-notice ${requiresAppointment?"workflow-warning":"workflow-success"}`}><strong>{requiresAppointment?"TENANT MUST BE PRESENT":isManual?"APPOINTMENT OPTIONAL":"ROOM ACCESS GRANTED"}</strong><span>{requiresAppointment?"Appointment Required.":isManual?"Assign eligible staff now; provide both date and time only when scheduling a visit.":"Maintenance staff may enter without the student. Scheduling a visit is optional."}</span></aside>
  {(source.photo_url||source.source_reference)&&<section className="panel" style={{marginBottom:18}}><h3>{complaint.source==="cleaning"?"Cleaner Report":"Google Form Source"}</h3>{complaint.source!=="cleaning"&&source.source_reference&&<p><strong>Response:</strong> {source.source_reference}</p>}{photoHref?<p><a className="button-link button" href={photoHref} target="_blank" rel="noreferrer">Open Complaint Photo ↗</a></p>:source.photo_url&&<p className="error">The attached photo is temporarily unavailable.</p>}</section>}<ComplaintForm blocks={blocks||[]} complaint={complaint} mode="review"/>{jobs.length>0&&<section className="panel list-panel" style={{marginBottom:18}}><h3>Confirmed defects ({jobs.length}/10)</h3>{jobs.map((job)=><div className="list-row" key={job.id}><div><strong>{job.job_no} · {job.description}</strong><p>{job.assignee?.full_name||"Unassigned"} · {job.status.replaceAll("_"," ")}</p></div><a className="button-link" href={`/admin/jobs/${job.id}`}>View job</a></div>)}</section>}{!["rejected","closed"].includes(complaint.status)&&jobs.length<10&&<section className="panel assignment-panel"><h3>Approve and assign</h3><p className="subtle">Add each confirmed defect, then choose an active maintenance staff member assigned to Block {complaint.block?.code}. You can add more later, up to 10 total.</p><AssignmentForm complaintId={id} eligible={eligible||[]} requiresAppointment={requiresAppointment} existingCount={jobs.length}/>{jobs.length===0&&<RejectComplaintForm complaintId={id}/>}</section>}
  </AppShell>;
}
