"use client";

import { rejectComplaint } from "@/app/(dashboard)/admin/complaints/actions";

export function RejectComplaintForm({ complaintId }: { complaintId: string }) {
  const action = rejectComplaint.bind(null, complaintId);
  return <form action={action}><button className="button danger" type="submit" onClick={(event) => { if (!window.confirm("Reject this complaint? This action removes it from the active review queue.")) event.preventDefault(); }}>Reject complaint</button></form>;
}
