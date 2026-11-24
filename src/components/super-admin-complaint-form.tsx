import { SubmitButton } from "@/components/submit-button";

export function SuperAdminComplaintForm({ action, status, hasJobs }: {
  action: (data: FormData) => Promise<void>;
  status: string;
  hasJobs: boolean;
}) {
  return <section className="panel super-admin-complaint-panel" aria-labelledby="super-admin-complaint-title">
    <p className="eyebrow">Super Admin</p>
    <h3 id="super-admin-complaint-title">Update Complaint Status</h3>
    {hasJobs ? <p className="subtle">This complaint already has maintenance jobs. Open the linked jobs below to update their progress.</p> : <>
      <p className="subtle">Use KIV (Keep In View) to hold this complaint for later. The complaint stays open. Resume with New or Under Review, or Approve and Assign when ready.</p>
      <form action={action} className="form-grid">
        <label className="field">Change complaint status
          <select name="status" required defaultValue="">
            <option value="" disabled>Select new status (currently {status === "kiv" ? "KIV" : status.replaceAll("_", " ")})</option>
            <option value="kiv">KIV · Keep In View / On Hold</option>
            <option value="new">New · Resume processing</option>
            <option value="under_review">Under Review</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label className="field field-wide">Reason / follow-up note
          <textarea name="reason" minLength={3} maxLength={1000} rows={3} required placeholder="Explain why this complaint is on hold or why its status should change."/>
        </label>
        <div className="field-wide"><SubmitButton pendingText="Updating…">Save as Super Admin</SubmitButton></div>
      </form>
    </>}
  </section>;
}
