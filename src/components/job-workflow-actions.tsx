"use client";

import { useId, useRef, useState, type MouseEvent } from "react";
import { checkJobMaterialApproval, markTenantNotAvailable, monitorJob, resumeJob, setPendingMaterial, startJob } from "@/app/(dashboard)/staff/jobs/actions";
import { availableJobActions } from "@/lib/job-workflow";
import { SubmitButton } from "@/components/submit-button";
import { CompleteJobForm } from "@/components/complete-job-form";

const approvalLookupError = "Unable to check material approval. Please try again.";

function CompletionAction({ jobId, returnTo }: { jobId: string; returnTo: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const messageId = useId();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  function showPendingApproval() {
    dialog.current?.showModal();
  }

  async function toggleCompletion(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    if (checking) return;
    if (open) {
      setOpen(false);
      return;
    }

    setChecking(true);
    setError("");
    try {
      const result = await checkJobMaterialApproval(jobId);
      if (result.pendingApproval === true) showPendingApproval();
      else if (result.pendingApproval === false) setOpen(true);
      else setError(result.error || approvalLookupError);
    } catch {
      setError(approvalLookupError);
    } finally {
      setChecking(false);
    }
  }

  return <>
    <details className="panel workflow-card" open={open}>
      <summary aria-busy={checking} onClick={toggleCompletion}>Complete Job</summary>
      <CompleteJobForm jobId={jobId} returnTo={returnTo} onPendingApproval={showPendingApproval}/>
    </details>
    <dialog ref={dialog} className="panel job-completion-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId}>
      <h2 id={titleId}>Cannot Complete Job</h2>
      <p id={messageId}>Material request is still pending approval . Please wait for Admin to approve the required materials before completing this job.</p>
      <button className="button" type="button" onClick={() => dialog.current?.close()}>PLEASE CONTACT WITH ADMIN</button>
    </dialog>
    {error && <p className="error job-completion-error" role="alert">{error}</p>}
  </>;
}

export function JobWorkflowActions({ jobId, status, monitoringNote, hasActionableAppointment = false, returnTo = "/staff/tasks" }: { jobId: string; status: string; monitoringNote?: string | null; hasActionableAppointment?: boolean; returnTo?: string }) {
  const actions = availableJobActions(status);
  if (!actions.length && !hasActionableAppointment) return null;
  const startAction = actions.includes("start") && <form action={startJob.bind(null, jobId)} className="start-action"><input type="hidden" name="returnTo" value={returnTo}/><SubmitButton pendingText="Starting…">Start Job</SubmitButton></form>;
  const unavailableAction = hasActionableAppointment && <details className="panel workflow-card"><summary>Tenant Not Available</summary><form action={markTenantNotAvailable.bind(null, jobId)}><input type="hidden" name="returnTo" value={returnTo}/><label className="field"><span>Remarks (optional)</span><textarea name="remarks" rows={4} maxLength={1000} placeholder="Add attendance details"/></label><SubmitButton pendingText="Recording…">Confirm tenant not available</SubmitButton></form></details>;
  if (actions[0] === "start" && !hasActionableAppointment) return startAction;

  return <section className="workflow-section"><div className="section-head"><div><h3>Update this job</h3><p className="subtle">Choose the next operational outcome.</p></div></div><div className="workflow-grid">
    {startAction}
    {unavailableAction}
    {actions.includes("complete") && <CompletionAction jobId={jobId} returnTo={returnTo}/>}
    {actions.includes("monitor") && <details className="panel workflow-card"><summary>{status === "under_monitoring" ? "Update Monitoring" : "Under Monitoring"}</summary><form action={monitorJob.bind(null, jobId)}><input type="hidden" name="returnTo" value={returnTo}/><label className="field"><span>Monitoring Note *</span><textarea name="monitoringNote" rows={5} required defaultValue={monitoringNote || ""} placeholder="What should be observed?"/></label><label className="field"><span>Follow-up / Review Date</span><input name="reviewAt" type="datetime-local"/></label><SubmitButton pendingText="Saving…">Save monitoring</SubmitButton></form></details>}
    {actions.includes("pending_material") && <details className="panel workflow-card"><summary>Pending Material</summary><form action={setPendingMaterial.bind(null, jobId)}><input type="hidden" name="returnTo" value={returnTo}/><label className="field"><span>Reason / Material Needed *</span><textarea name="materialNote" rows={5} required placeholder="List the material or explain what is needed"/></label><SubmitButton pendingText="Saving…">Set pending material</SubmitButton></form></details>}
    {actions.includes("resume") && <article className="panel workflow-card"><h3>Material available?</h3><p className="subtle">Return this job to In Progress when work can continue.</p><form action={resumeJob.bind(null, jobId)}><input type="hidden" name="returnTo" value={returnTo}/><SubmitButton pendingText="Resuming…">Resume Job</SubmitButton></form></article>}
  </div></section>;
}
