"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
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

const defectOptions = {
  Room: {
    "Door Handle": ["Loose", "Broken", "Missing", "Rusty"],
    "Door Closer": ["Loose", "Broken", "Missing"],
    "Door Lock / Key": ["Loose", "Broken", "Key Missing", "Rusty"],
    "Ceiling Fan": ["Noisy", "No Power", "Shaking"],
    "Air Conditioning": ["Not Cool", "No Power", "Leaking", "Remote Malfunction"],
    Lighting: ["Not Working", "Broken"],
    Divan: ["Broken", "Missing"], Headboard: ["Broken", "Missing"], Mattress: ["Broken", "Missing"],
    "Study Table": ["Broken", "Missing", "Bloated"], "Utility Table": ["Broken", "Missing", "Bloated"],
    Chair: ["Broken", "Missing"], Bookshelf: ["Broken", "Missing", "Bloated"], Wardrobe: ["Broken", "Missing", "Bloated"],
    Curtain: ["Broken", "Missing", "Dirty"], "Curtain Hook / Holder": ["Broken", "Missing"],
    Floor: ["Water Mark", "Leaking", "Vinyl Tiles Broken"], Wall: ["Water Seepage", "Mouldy", "Near Window", "Near Door", "Near Bathroom"],
    Other: ["Other"],
  },
  Bathroom: {
    "Door Knob": ["Loose", "Broken", "Cannot Open"], "Water Tap / Sink Tap": ["Leaking", "Broken", "Slow Pressure"],
    "Shower Valve": ["Leaking", "Broken", "Slow Pressure"], "Toilet Seat": ["Dirty", "Broken"],
    "Flexible Hose": ["Leaking", "Broken"], Other: ["Other"],
  },
  "Common Area": { Lighting: ["Not Working", "Broken"], "Water Leakage": ["Leaking"], Other: ["Other"] },
} as const;

type DefectArea = keyof typeof defectOptions;

function AssignmentSubmitButton() {
  const { pending } = useFormStatus();
  return <button className="button assignment-submit" type="submit" disabled={pending} aria-busy={pending}>{pending ? "Adding defect…" : "+ Add Defect & Assign Job"}</button>;
}

type AssignmentFormProps = {
  complaintId: string;
  eligible: { id: string; full_name: string }[];
  requiresAppointment?: boolean;
  existingCount?: number;
  source?: string;
  roomAccess?: string | null;
  preferredDate?: string | null;
  preferredTime?: string | null;
};

export function AssignmentForm({ complaintId, eligible, requiresAppointment = false, existingCount = 0, source, roomAccess, preferredDate, preferredTime }: AssignmentFormProps) {
  const action = assignComplaint.bind(null, complaintId);
  const [area, setArea] = useState<DefectArea>("Room");
  const items = useMemo(() => Object.keys(defectOptions[area]), [area]);
  const [item, setItem] = useState(items[0]);
  const issues = defectOptions[area][item as keyof (typeof defectOptions)[typeof area]] as readonly string[];
  const [issue, setIssue] = useState(issues[0]);

  const chooseArea = (nextArea: DefectArea) => {
    const nextItem = Object.keys(defectOptions[nextArea])[0];
    const nextIssue = (defectOptions[nextArea][nextItem as keyof (typeof defectOptions)[typeof nextArea]] as readonly string[])[0];
    setArea(nextArea); setItem(nextItem); setIssue(nextIssue);
  };

  const chooseItem = (nextItem: string) => {
    const nextIssue = (defectOptions[area][nextItem as keyof (typeof defectOptions)[typeof area]] as readonly string[])[0];
    setItem(nextItem); setIssue(nextIssue);
  };
  const preferredVisit = source === "google_form" && roomAccess === "no" ? [preferredDate, preferredTime].filter(Boolean).join(" · ") : "";
  return (
    <form action={action} className="form-grid">
      <div className="field field-wide assignment-confirmation">
        <h4>Add Defect {existingCount + 1} for maintenance</h4>
        <p className="subtle">Select the verified defect. This is the exact problem Maintenance will receive. You can add up to 10 defects for one complaint.</p>
      </div>
      <label className="field"><span>Area *</span><select name="defectArea" value={area} onChange={(event) => chooseArea(event.target.value as DefectArea)}>{Object.keys(defectOptions).map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="field"><span>Defect Item *</span><select name="defectItem" value={item} onChange={(event) => chooseItem(event.target.value)}>{items.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="field"><span>Problem *</span><select name="defectIssue" value={issue} onChange={(event) => setIssue(event.target.value)}>{issues.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="field field-wide"><span>Location / Other Note</span><input name="defectNote" maxLength={500} placeholder="Example: Near window, beside main door, or describe other defect"/></label>
      <>
        <div className="field field-wide"><h4>{existingCount ? "Add another maintenance appointment" : "Maintenance Appointment"}</h4><p className="subtle">Choose the actual visit date and time. {preferredVisit ? `Tenant preferred availability: ${preferredVisit}.` : "The tenant's preferred availability above is read-only."}</p></div>
        <label className="field"><span>Maintenance Date{requiresAppointment ? " *" : ""}</span><input name="appointmentDate" type="date" required={requiresAppointment} defaultValue={preferredDate || ""}/></label>
        <label className="field"><span>Maintenance Time{requiresAppointment ? " *" : ""}</span><select name="appointmentTime" defaultValue="" required={requiresAppointment}><option value="">{requiresAppointment ? "Choose a time slot" : "No appointment"}</option>{appointmentTimeSlots.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}</select></label>
      </>
      <label className="field"><span>Assigned Staff *</span><select name="staffId" required><option value="">Choose eligible staff</option>{eligible.map((staff) => <option key={staff.id} value={staff.id}>{staff.full_name}</option>)}</select></label>
      <label className="field field-wide"><span>Remarks</span><textarea name="remarks" rows={3} maxLength={1000}/></label>
      <div className="field field-wide"><AssignmentSubmitButton/></div>
    </form>
  );
}
