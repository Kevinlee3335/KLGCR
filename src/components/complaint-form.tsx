"use client";

import { assignComplaint, createComplaint, reviewComplaint } from "@/app/(dashboard)/admin/complaints/actions";
import { appointmentTimeSlots } from "@/lib/appointments";
import { priorities, sources, titleCase, type ComplaintRow } from "@/lib/phase2";

type ComplaintFormProps = {
  blocks: { id: number; code: string }[];
  complaint?: ComplaintRow;
  mode: "create" | "review";
};

export function ComplaintForm({ blocks, complaint, mode }: ComplaintFormProps) {
  const action = mode === "create" ? createComplaint : reviewComplaint.bind(null, complaint!.id);
  return (
    <form action={action} className="panel form-grid operational-form">
      <label className="field"><span>Source</span><select name="source" defaultValue={complaint?.source || "manual"}>{sources.map((source) => <option key={source} value={source}>{titleCase(source)}</option>)}</select></label>
      <label className="field"><span>Block *</span><select name="blockId" required defaultValue={complaint?.block?.id}><option value="">Choose block</option>{blocks.map((block) => <option key={block.id} value={block.id}>Block {block.code}</option>)}</select></label>
      <label className="field"><span>Room *</span><input name="room" required defaultValue={complaint?.room_no}/></label>
      <label className="field"><span>Category *</span><input name="category" required defaultValue={complaint?.category}/></label>
      <label className="field"><span>Complainant name</span><input name="name" defaultValue={complaint?.complainant_name || ""}/></label>
      <label className="field"><span>Contact</span><input name="contact" defaultValue={complaint?.complainant_contact || ""}/></label>
      <label className="field"><span>Priority *</span><select name="priority" required defaultValue={complaint?.priority || "normal"}>{priorities.map((priority) => <option key={priority} value={priority}>{titleCase(priority)}</option>)}</select></label>
      <label className="field field-wide"><span>Description *</span><textarea name="description" required rows={5} defaultValue={complaint?.description}/></label>
      <div className="field-wide"><button className="button" type="submit">{mode === "create" ? "Save complaint" : "Save review"}</button></div>
    </form>
  );
}

export function AssignmentForm({ complaintId, eligible, requiresAppointment = false }: { complaintId: string; eligible: { id: string; full_name: string }[]; requiresAppointment?: boolean }) {
  const action = assignComplaint.bind(null, complaintId);
  return (
    <form action={action} className={requiresAppointment ? "form-grid" : "inline-form"}>
      {requiresAppointment && <>
        <div className="field field-wide"><h4>Maintenance Appointment</h4><p className="subtle">Choose the actual visit date and time. The tenant&apos;s preferred availability above is read-only and is not copied automatically.</p></div>
        <label className="field"><span>Maintenance Date *</span><input name="appointmentDate" type="date" required/></label>
        <label className="field"><span>Maintenance Time *</span><select name="appointmentTime" defaultValue="" required><option value="" disabled>Choose a time slot</option>{appointmentTimeSlots.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}</select></label>
      </>}
      <label className="field"><span>Assigned Staff *</span><select name="staffId" required><option value="">Choose eligible staff</option>{eligible.map((staff) => <option key={staff.id} value={staff.id}>{staff.full_name}</option>)}</select></label>
      <div className={requiresAppointment ? "field field-wide" : undefined}><button className="button" type="submit">Approve &amp; create job</button></div>
    </form>
  );
}
