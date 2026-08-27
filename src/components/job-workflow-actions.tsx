"use client";

import { completeJob, monitorJob, resumeJob, setPendingMaterial, startJob } from "@/app/(dashboard)/staff/jobs/actions";
import { availableJobActions } from "@/lib/job-workflow";

export function JobWorkflowActions({ jobId, status, monitoringNote }: { jobId: string; status: string; monitoringNote?: string | null }) {
  const actions = availableJobActions(status);
  if (!actions.length) return null;
  if (actions[0] === "start") return <form action={startJob.bind(null, jobId)} className="start-action"><button className="button" type="submit">Start Job</button></form>;

  return <section className="workflow-section"><div className="section-head"><div><h3>Update this job</h3><p className="subtle">Choose the next operational outcome.</p></div></div><div className="workflow-grid">
    {actions.includes("complete") && <details className="panel workflow-card"><summary>Complete Job</summary><form action={completeJob.bind(null, jobId)}><label className="field"><span>Action Taken / Work Done *</span><textarea name="actionTaken" rows={5} required placeholder="Describe the repair or work completed"/></label><div className="upload-placeholder"><strong>Completion photo</strong><span>Optional photo storage will connect here in a later phase.</span></div><button className="button" type="submit">Confirm completion</button></form></details>}
    {actions.includes("monitor") && <details className="panel workflow-card"><summary>{status === "under_monitoring" ? "Update Monitoring" : "Under Monitoring"}</summary><form action={monitorJob.bind(null, jobId)}><label className="field"><span>Monitoring Note *</span><textarea name="monitoringNote" rows={5} required defaultValue={monitoringNote || ""} placeholder="What should be observed?"/></label><label className="field"><span>Follow-up / Review Date</span><input name="reviewAt" type="datetime-local"/></label><button className="button" type="submit">Save monitoring</button></form></details>}
    {actions.includes("pending_material") && <details className="panel workflow-card"><summary>Pending Material</summary><form action={setPendingMaterial.bind(null, jobId)}><label className="field"><span>Reason / Material Needed *</span><textarea name="materialNote" rows={5} required placeholder="List the material or explain what is needed"/></label><button className="button" type="submit">Set pending material</button></form></details>}
    {actions.includes("resume") && <article className="panel workflow-card"><h3>Material available?</h3><p className="subtle">Return this job to In Progress when work can continue.</p><form action={resumeJob.bind(null, jobId)}><button className="button" type="submit">Resume Job</button></form></article>}
  </div></section>;
}
