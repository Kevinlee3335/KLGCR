"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { assignComplaint, createComplaint, reviewComplaint } from "@/app/(dashboard)/admin/complaints/actions";
import { appointmentTimeSlots, preferredAppointmentSelection } from "@/lib/appointments";
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

function AssignmentSubmitButton({ defectCount }: { defectCount: number }) {
  const { pending } = useFormStatus();
  return <button className="button assignment-submit" type="submit" disabled={pending} aria-busy={pending}>{pending ? "Assigning…" : `Assign ${defectCount} Defect${defectCount === 1 ? "" : "s"} to Maintenance`}</button>;
}

type ConfirmedDefect = {
  key: number;
  area: DefectArea;
  item: string;
  issue: string;
  note: string;
};

function newDefect(key: number): ConfirmedDefect {
  const area: DefectArea = "Room";
  const item = Object.keys(defectOptions[area])[0];
  const issue = (defectOptions[area][item as keyof (typeof defectOptions)[typeof area]] as readonly string[])[0];
  return { key, area, item, issue, note: "" };
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
  const [defects, setDefects] = useState<ConfirmedDefect[]>(() => [newDefect(existingCount + 1)]);
  const updateDefect = (key: number, change: Partial<ConfirmedDefect>) => setDefects((current) => current.map((defect) => {
    if (defect.key !== key) return defect;
    const next = { ...defect, ...change };
    if (change.area) {
      next.item = Object.keys(defectOptions[change.area])[0];
      next.issue = (defectOptions[change.area][next.item as keyof (typeof defectOptions)[typeof change.area]] as readonly string[])[0];
    }
    if (change.item && !change.area) {
      next.issue = (defectOptions[next.area][change.item as keyof (typeof defectOptions)[typeof next.area]] as readonly string[])[0];
    }
    return next;
  }));
  const preferredVisit = source === "google_form" && roomAccess === "no" ? [preferredDate, preferredTime].filter(Boolean).join(" · ") : "";
  const preferredAppointment = preferredAppointmentSelection(source, roomAccess, preferredDate, preferredTime);
  return (
    <form action={action} className="form-grid">
      <div className="field field-wide assignment-confirmation">
        <h4>Confirmed defects for maintenance</h4>
        <p className="subtle">Add every verified defect in this complaint first. Maintenance will receive the complete defect list. You can add up to 10 defects.</p>
      </div>
      <div className="field field-wide assignment-action-bar"><button className="button assignment-submit" type="button" onClick={() => setDefects((current) => current.length >= 10 ? current : [...current, newDefect(existingCount + current.length + 1)])} disabled={defects.length >= 10}>+ Add Another Defect</button></div>
      <input type="hidden" name="defects" value={JSON.stringify(defects.map(({ area, item, issue, note }) => ({ area, item, issue, note })))} />
      {defects.map((defect, index) => {
        const items = Object.keys(defectOptions[defect.area]);
        const issues = defectOptions[defect.area][defect.item as keyof (typeof defectOptions)[typeof defect.area]] as readonly string[];
        return <div className="field-wide confirmed-defect-card" key={defect.key}>
          <div className="confirmed-defect-heading"><h4>Defect {existingCount + index + 1}</h4>{defects.length > 1 && <button className="button secondary button-compact" type="button" onClick={() => setDefects((current) => current.filter((entry) => entry.key !== defect.key))}>Remove</button>}</div>
          <div className="form-grid">
            <label className="field"><span>Area *</span><select value={defect.area} onChange={(event) => updateDefect(defect.key, { area: event.target.value as DefectArea })}>{Object.keys(defectOptions).map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="field"><span>Defect Item *</span><select value={defect.item} onChange={(event) => updateDefect(defect.key, { item: event.target.value })}>{items.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="field"><span>Problem *</span><select value={defect.issue} onChange={(event) => updateDefect(defect.key, { issue: event.target.value })}>{issues.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="field field-wide"><span>Location / Other Note</span><input value={defect.note} onChange={(event) => updateDefect(defect.key, { note: event.target.value })} maxLength={500} placeholder="Example: Near window, beside main door, or describe other defect"/></label>
          </div>
        </div>;
      })}
      {requiresAppointment && <>
        <div className="field field-wide"><h4>{existingCount ? "Add another maintenance appointment" : "Maintenance Appointment"}</h4><p className="subtle">The tenant&apos;s preferred availability is prefilled. Change it only when the tenant confirms a different visit time.</p></div>
        <label className="field"><span>Maintenance Date *</span><input name="appointmentDate" type="date" required defaultValue={preferredAppointment?.date || preferredDate || ""}/></label>
        <label className="field"><span>Maintenance Time *</span><select name="appointmentTime" defaultValue={preferredAppointment?.time || ""} required><option value="">Choose a time slot</option>{appointmentTimeSlots.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}</select></label>
      </>}
      <label className="field"><span>Assigned Staff *</span><select name="staffId" required><option value="">Choose eligible staff</option>{eligible.map((staff) => <option key={staff.id} value={staff.id}>{staff.full_name}</option>)}</select></label>
      <label className="field field-wide"><span>Remarks</span><textarea name="remarks" rows={3} maxLength={1000}/></label>
      <div className="field field-wide assignment-final-action"><AssignmentSubmitButton defectCount={defects.length}/></div>
    </form>
  );
}
