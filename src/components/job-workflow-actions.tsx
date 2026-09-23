"use client";

import { completeJob, markTenantNotAvailable, monitorJob, resumeJob, setPendingMaterial, startJob } from "@/app/(dashboard)/staff/jobs/actions";
import { availableJobActions } from "@/lib/job-workflow";
import { SubmitButton } from "@/components/submit-button";

export function JobWorkflowActions({ jobId, status, monitoringNote, hasActionableAppointment = false }: { jobId: string; status: string; monitoringNote?: string | null; hasActionableAppointment?: boolean }) {
  const actions = availableJobActions(status);
  if (!actions.length && !hasActionableAppointment) return null;
  const startAction = actions.includes("start") && <form action={startJob.bind(null, jobId)} className="start-action"><SubmitButton pendingText="Starting…">Start Job</SubmitButton></form>;
  const unavailableAction = hasActionableAppointment && <details className="panel workflow-card"><summary>Tenant Not Available</summary><form action={markTenantNotAvailable.bind(null, jobId)}><label className="field"><span>Remarks (optional)</span><textarea name="remarks" rows={4} maxLength={1000} placeholder="Add attendance details"/></label><SubmitButton pendingText="Recording…">Confirm tenant not available</SubmitButton></form></details>;
  if (actions[0] === "start" && !hasActionableAppointment) return startAction;

  return <section className="workflow-section"><div className="section-head"><div><h3>Update this job</h3><p className="subtle">Choose the next operational outcome.</p></div></div><div className="workflow-grid">
    {startAction}
    {unavailableAction}
    {actions.includes("complete") && <details className="panel workflow-card"><summary>Complete Job</summary><form action={completeJob.bind(null, jobId)}><label className="field"><span>Action Taken / Work Done *</span><textarea name="actionTaken" rows={5} required placeholder="Describe the repair or work completed"/></label><div className="field completion-photo-field"><span>Completion photo</span><label className="completion-photo-camera" title="Take completion photo"><input name="completionPhotos" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"/><span aria-hidden="true">📷</span><b>Take Photo</b></label><small className="subtle">Tap to open the phone camera. The photo uploads when you confirm completion.</small></div><SubmitButton pendingText="Completing…">Confirm completion</SubmitButton></form></details>}
    {actions.includes("monitor") && <details className="panel workflow-card"><summary>{status === "under_monitoring" ? "Update Monitoring" : "Under Monitoring"}</summary><form action={monitorJob.bind(null, jobId)}><label className="field"><span>Monitoring Note *</span><textarea name="monitoringNote" rows={5} required defaultValue={monitoringNote || ""} placeholder="What should be observed?"/></label><label className="field"><span>Follow-up / Review Date</span><input name="reviewAt" type="datetime-local"/></label><SubmitButton pendingText="Saving…">Save monitoring</SubmitButton></form></details>}
    {actions.includes("pending_material") && <details className="panel workflow-card"><summary>Pending Material</summary><form action={setPendingMaterial.bind(null, jobId)}><label className="field"><span>Reason / Material Needed *</span><textarea name="materialNote" rows={5} required placeholder="List the material or explain what is needed"/></label><SubmitButton pendingText="Saving…">Set pending material</SubmitButton></form></details>}
    {actions.includes("resume") && <article className="panel workflow-card"><h3>Material available?</h3><p className="subtle">Return this job to In Progress when work can continue.</p><form action={resumeJob.bind(null, jobId)}><SubmitButton pendingText="Resuming…">Resume Job</SubmitButton></form></article>}
  </div></section>;
}
