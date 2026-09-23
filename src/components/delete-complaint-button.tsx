"use client";

import { deleteComplaint } from "@/app/(dashboard)/admin/complaints/actions";
import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

function DeleteButton({ compact }: { compact: boolean }) {
  const { pending } = useFormStatus();
  return <button className={compact ? "button button-danger button-compact" : "button button-danger"} type="submit" disabled={pending} aria-busy={pending}>
    <Trash2 size={15} aria-hidden="true"/>
    {pending ? "Deleting…" : "Delete"}
  </button>;
}

export function DeleteComplaintButton({ complaintId, compact = false }: { complaintId: string; compact?: boolean }) {
  const action = deleteComplaint.bind(null, complaintId);
  return (
    <form action={action} onSubmit={(event) => {
      if (!window.confirm("Delete this complaint permanently? This cannot be undone.")) event.preventDefault();
    }}>
      <DeleteButton compact={compact}/>
    </form>
  );
}
