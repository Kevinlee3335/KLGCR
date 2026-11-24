"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";

export function SuperAdminJobForm({ action, status, checkoutDate }: {
  action: (data: FormData) => Promise<void>;
  status: string;
  checkoutDate?: string | null;
}) {
  const [selected, setSelected] = useState("");
  return <form action={action} className="form-grid">
    <label className="field">Change status
      <select name="status" required value={selected} onChange={event => setSelected(event.target.value)}>
        <option value="" disabled>Select new status (currently {status.replaceAll("_", " ")})</option>
        <option value="assigned">Assigned</option>
        <option value="in_progress">In Progress</option>
        <option value="pending_material">Pending Material</option>
        <option value="waiting_checkout">Waiting for Check-out · Repair after tenant checks out</option>
        <option value="under_monitoring">Under Monitoring</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled (duplicate / invalid job)</option>
      </select>
    </label>
    {selected === "waiting_checkout" && <label className="field">Check-out date *
      <input name="checkoutDate" type="date" required defaultValue={checkoutDate || ""}/>
      <small>The defect stays open. Confirm the tenant has checked out before starting repairs on or after this date.</small>
    </label>}
    {selected === "under_monitoring" && <label className="field">Next monitoring review *<input name="reviewDate" type="date" required/></label>}
    <label className="field field-wide">Reason / work update
      <textarea name="reason" minLength={3} maxLength={2000} rows={3} required placeholder="Describe the work update or why repairs should wait until check-out."/>
    </label>
    <div className="field-wide"><SubmitButton pendingText="Updating…">Save as Super Admin</SubmitButton></div>
  </form>;
}
