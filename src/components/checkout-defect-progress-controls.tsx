"use client";

import { updateCheckoutDefectStatus } from "@/app/(dashboard)/staff/checkouts/actions";
import { SubmitButton } from "@/components/submit-button";

export function CheckoutDefectProgressControls({ checkoutId, defectId, status }: { checkoutId: string; defectId: string; status: string }) {
  return (
    <form action={updateCheckoutDefectStatus.bind(null, checkoutId, defectId)} className="defect-status-form">
      <label>
        <span>Defect status</span>
        <select name="status" defaultValue={status}>
          <option value="open">In Progress</option>
          <option value="rectified">Completed</option>
        </select>
      </label>
      <SubmitButton pendingText="Updating…">Update</SubmitButton>
    </form>
  );
}
