import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { JobWorkflowActions } from "@/components/job-workflow-actions";
import { PriorityBadge, StatusBadge } from "@/components/phase2-ui";
import { requireRole } from "@/lib/auth";
import { formatDate, type JobRow } from "@/lib/phase2";
import { createClient } from "@/lib/supabase/server";

const successMessages: Record<string, string> = {
  started: "Job started successfully.", completed: "Job completed successfully.", monitoring: "Monitoring details saved.",
  "pending-material": "Job marked as Pending Material.", resumed: "Job returned to In Progress.",
};

export default async function StaffJob({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const profile = await requireRole(["maintenance_staff"]);
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("maintenance_jobs").select("id,job_no,room_no,category,description,priority,status,assigned_at,updated_at,started_at,completed_at,action_taken,monitoring_note,monitoring_started_at,monitoring_review_at,pending_material_note,block:blocks!block_id(id,code),complaint:complaints!complaint_id(complaint_no)").eq("id", id).single();
  if (!data) notFound();
  const job = data as unknown as JobRow;
  const success = query.success ? successMessages[query.success] : null;

  return <AppShell profile={profile} title="Job Detail">
    <div className="section-head"><div><p className="eyebrow">{job.job_no}</p><h2>Block {job.block?.code} · {job.room_no}</h2><p className="subtle">Assigned {formatDate(job.assigned_at)}</p></div><div className="actions"><PriorityBadge value={job.priority}/><StatusBadge value={job.status}/></div></div>
    {query.error && <p className="error">{query.error}</p>}{success && <p className="success">{success}</p>}
    <section className="panel detail-grid"><div><span>Complaint</span><strong>{job.complaint?.complaint_no}</strong></div><div><span>Category</span><strong>{job.category}</strong></div><div className="field-wide"><span>Description</span><p>{job.description}</p></div></section>
    {(job.action_taken || job.monitoring_note || job.pending_material_note) && <section className="job-notes job-note-grid">
      {job.action_taken && <article className="panel"><h3>Action Taken</h3><p>{job.action_taken}</p>{job.completed_at && <small className="subtle">Completed {formatDate(job.completed_at)}</small>}</article>}
      {job.monitoring_note && <article className="panel"><h3>Monitoring Note</h3><p>{job.monitoring_note}</p>{job.monitoring_review_at && <small className="subtle">Review {formatDate(job.monitoring_review_at)}</small>}</article>}
      {job.pending_material_note && <article className="panel"><h3>Material Needed</h3><p>{job.pending_material_note}</p></article>}
    </section>}
    <JobWorkflowActions jobId={id} status={job.status} monitoringNote={job.monitoring_note}/>
  </AppShell>;
}
