"use client";

import { deleteComplaint } from "@/app/(dashboard)/admin/complaints/actions";

export function DeleteComplaintButton({ complaintId, compact = false }: { complaintId: string; compact?: boolean }) {
  const action = deleteComplaint.bind(null, complaintId);
  return (
    <form action={action} onSubmit={(event) => {
      if (!window.confirm("Delete this complaint permanently? This cannot be undone.")) event.preventDefault();
    }}>
      <button className={compact ? "text-link danger-link" : "button danger"} type="submit">
        Delete
      </button>
    </form>
  );
}
