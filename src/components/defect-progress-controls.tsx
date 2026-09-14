"use client";

import { updateDefectProgress } from "@/app/(dashboard)/staff/jobs/actions";
import { SubmitButton } from "@/components/submit-button";

type DefectStatus = "confirmed" | "in_progress" | "under_monitoring" | "pending_material" | "completed";

export function DefectProgressControls({
  jobId,
  defectId,
  status,
}: {
  jobId: string;
  defectId: string;
  status: DefectStatus;
}) {
  return (
    <form action={updateDefectProgress.bind(null, jobId, defectId)} className="defect-status-form">
      <label>
        <span>Job Status</span>
        <select name="status" defaultValue={status === "confirmed" ? "in_progress" : status}>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="under_monitoring">Under Monitoring</option>
          <option value="pending_material">Pending Material</option>
        </select>
      </label>
      <input name="note" placeholder="Optional note" />
      <SubmitButton pendingText="Updating…">Update</SubmitButton>
    </form>
  );
}
