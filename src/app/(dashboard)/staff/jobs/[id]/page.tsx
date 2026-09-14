/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { JobWorkflowActions } from "@/components/job-workflow-actions";
import { PriorityBadge, StatusBadge } from "@/components/phase2-ui";
import { requireRole } from "@/lib/auth";
import { formatDate, type JobRow } from "@/lib/phase2";
import { createClient } from "@/lib/supabase/server";
import { ReporterInformation } from "@/components/reporter-information";
import { MaintenanceAppointment } from "@/components/maintenance-appointment";
import { DefectProgressControls } from "@/components/defect-progress-controls";

const successMessages: Record<string, string> = { "defect-updated": "Defect status updated.", started: "Job started successfully.", completed: "Job completed successfully.", monitoring: "Monitoring details saved.", "pending-material": "Job marked as Pending Material.", resumed: "Job returned to In Progress.", "tenant-not-available": "Tenant not available recorded. The job remains open." };
const defectStatusLabel: Record<string, string> = { confirmed: "Confirmed", in_progress: "In Progress", pending_material: "Pending Material", under_monitoring: "Under Monitoring", completed: "Completed" };

export default async function StaffJob({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const profile = await requireRole(["maintenance_staff"]); const { id } = await params; const query = await searchParams; const supabase = await createClient();
  const [{ data, error: jobError }, { data: materialRequests }] = await Promise.all([
    supabase.from("maintenance_jobs").select("id,job_no,room_no,category,description,priority,status,assigned_at,updated_at,started_at,completed_at,action_taken,monitoring_note,monitoring_started_at,monitoring_review_at,pending_material_note,block:blocks!maintenance_jobs_block_id_fkey(id,code),complaint:complaints!maintenance_jobs_complaint_id_fkey(id,complaint_no,complainant_name,complainant_contact,reporter_name,reporter_phone,availability_date,availability_time,room_access_permission)").eq("id", id).single(),
    supabase.from("material_requests").select("id,request_no,status,created_at,items:material_request_items(requested_qty,issued_qty,item:inventory_items(item_code,description,unit))").eq("job_id", id).order("created_at", { ascending: false }),
  ]);
  if (jobError) throw new Error(`Failed to load maintenance job: ${jobError.message}`);
  if (!data) notFound();
  const job = data as unknown as JobRow;
  const { data: defectRows } = job.complaint?.id ? await supabase.from("complaint_defects").select("id,item_name,issue_type,other_issue,exact_location,admin_confirmed_issue,maintenance_instruction,status").eq("complaint_id", job.complaint.id).order("created_at") : { data: [] };
  const success = query.success ? successMessages[query.success] : null;
  let hasActionableAppointment = false;
  let appointment: {appointment_date:string;appointment_time:string;status:string;remarks:string|null;staff:{full_name:string}|null}|null = null;
  if (job.complaint?.id) {
    const { data: appointmentRows } = await supabase.from("appointments")
      .select("appointment_date,appointment_time,status,remarks,staff:profiles!appointments_assigned_staff_fkey(full_name)")
      .eq("job_id", job.id)
      .not("status", "in", '("cancelled","no_show")')
      .order("created_at", { ascending: false })
      .limit(1);
    appointment = (appointmentRows?.[0] ?? null) as typeof appointment;
    hasActionableAppointment = Boolean(appointmentRows?.[0] && ["pending_confirmation", "confirmed"].includes(appointmentRows[0].status));
  }
  return <AppShell profile={profile} title="Job Detail"><div className="section-head"><div><p className="eyebrow">{job.job_no}</p><h2>Block {job.block?.code} · {job.room_no}</h2><p className="subtle">Assigned {formatDate(job.assigned_at)}</p></div><div className="actions"><PriorityBadge value={job.priority}/><StatusBadge value={job.status}/></div></div>{query.error && <p className="error">{query.error}</p>}{success && <p className="success">{success}</p>}<section className="panel detail-grid"><div><span>Complaint</span><strong>{job.complaint?.complaint_no}</strong></div><div><span>Category</span><strong>{job.category}</strong></div><div className="field-wide"><span>Description</span><p>{job.description}</p></div></section>{(defectRows||[]).length>0&&<section className="panel"><h3>Admin Confirmed Defects</h3><p className="subtle">{(defectRows||[]).length > 1 ? "Update each defect separately. The overall Job status will follow the outstanding work." : "Follow this confirmed work item and instruction."}</p><div className="defect-list">{(defectRows||[]).map((d)=><div key={d.id} className={(defectRows||[]).length > 1 ? "defect-row defect-row-actionable" : "defect-row"}><div className="defect-detail"><span className={`status-badge status-${d.status}`}>{defectStatusLabel[d.status] || d.status.replaceAll("_"," ")}</span><strong>{d.item_name} — {d.issue_type==="Other"?d.other_issue:d.issue_type}</strong>{d.exact_location&&<small>Location: {d.exact_location}</small>}{d.admin_confirmed_issue&&<small>Confirmed issue: {d.admin_confirmed_issue}</small>}{d.maintenance_instruction&&<small>Instruction: {d.maintenance_instruction}</small>}</div>{(defectRows||[]).length > 1 && <DefectProgressControls jobId={id} defectId={d.id} status={d.status} />}</div>)}</div></section>}<ReporterInformation name={job.complaint?.reporter_name || job.complaint?.complainant_name} phone={job.complaint?.reporter_phone || job.complaint?.complainant_contact} availabilityDate={job.complaint?.availability_date} availabilityTime={job.complaint?.availability_time} roomAccessPermission={job.complaint?.room_access_permission}/><MaintenanceAppointment appointment={appointment}/>{(job.action_taken || job.monitoring_note || job.pending_material_note) && <section className="job-notes job-note-grid">{job.action_taken && <article className="panel"><h3>Action Taken</h3><p>{job.action_taken}</p>{job.completed_at && <small className="subtle">Completed {formatDate(job.completed_at)}</small>}</article>}{job.monitoring_note && <article className="panel"><h3>Monitoring Note</h3><p>{job.monitoring_note}</p>{job.monitoring_review_at && <small className="subtle">Review {formatDate(job.monitoring_review_at)}</small>}</article>}{job.pending_material_note && <article className="panel"><h3>Material Needed</h3><p>{job.pending_material_note}</p></article>}</section>}{(job.status === "in_progress" || job.status === "pending_material") && <p><Link className="button" href={`/staff/material-request?job=${id}`}>Request Material</Link></p>}{(materialRequests || []).length > 0 && <section className="panel list-panel"><h3>Material Requests</h3>{(materialRequests || []).map((request: any) => <div className="list-row" key={request.id}><div><div className="actions"><strong>{request.request_no}</strong><span className="badge">{request.status}</span></div>{(request.items || []).map((row: any, index: number) => <p key={`${request.id}-${index}`}>{row.item?.item_code} · {row.item?.description} — Requested {row.requested_qty} {row.item?.unit || ""}{row.issued_qty ? ` · Issued ${row.issued_qty}` : ""}</p>)}</div></div>)}</section>}{(defectRows||[]).length <= 1 && <JobWorkflowActions jobId={id} status={job.status} monitoringNote={job.monitoring_note} hasActionableAppointment={hasActionableAppointment}/>}</AppShell>;
}
