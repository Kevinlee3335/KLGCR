"use client";

import { useState } from "react";
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
    "Door Handle": ["Loose", "Broken", "Missing", "Rusty"], "Door Closer": ["Loose", "Broken", "Missing"], "Door Lock / Key": ["Loose", "Broken", "Key Missing", "Rusty"], "Ceiling Fan": ["Noisy", "No Power", "Shaking"], "Air Conditioning": ["Not Cool", "No Power", "Leaking", "Remote Malfunction"], Lighting: ["Not Working", "Broken"], Divan: ["Broken", "Missing"], Headboard: ["Broken", "Missing"], Mattress: ["Broken", "Missing"], "Study Table": ["Broken", "Missing", "Bloated"], "Utility Table": ["Broken", "Missing", "Bloated"], Chair: ["Broken", "Missing"], Bookshelf: ["Broken", "Missing", "Bloated"], Wardrobe: ["Broken", "Missing", "Bloated"], Curtain: ["Broken", "Missing", "Dirty"], "Curtain Hook / Holder": ["Broken", "Missing"], Floor: ["Water Mark", "Leaking", "Vinyl Tiles Broken"], Wall: ["Water Seepage", "Mouldy", "Near Window", "Near Door", "Near Bathroom"], Other: ["Other"],
  },
  Bathroom: { "Door Knob": ["Loose", "Broken", "Cannot Open"], "Water Tap / Sink Tap": ["Leaking", "Broken", "Slow Pressure"], "Shower Valve": ["Leaking", "Broken", "Slow Pressure"], "Toilet Seat": ["Dirty", "Broken"], "Flexible Hose": ["Leaking", "Broken"], Other: ["Other"] },
  "Common Area": { Lighting: ["Not Working", "Broken"], "Water Leakage": ["Leaking"], Other: ["Other"] },
} as const;
type DefectArea = keyof typeof defectOptions;

type ConfirmedDefect = { id: number; area: DefectArea; item: string; issue: string; note: string };
const initialDefect = (id: number): ConfirmedDefect => ({
  id, area: "Room", item: "Door Handle", issue: "Loose", note: "",
});

export function AssignmentForm({ complaintId, eligible, requiresAppointment = false, existingCount = 0, source, roomAccess, preferredDate, preferredTime }: {
  complaintId: string; eligible: { id: string; full_name: string }[];
  requiresAppointment?: boolean; existingCount?: number; source?: string; roomAccess?: string | null;
  preferredDate?: string | null; preferredTime?: string | null;
}) {
  const action = assignComplaint.bind(null, complaintId);
  const preferred = preferredAppointmentSelection(source, roomAccess, preferredDate, preferredTime);
  const [defects, setDefects] = useState<ConfirmedDefect[]>([initialDefect(1)]);
  const remaining = Math.max(0, 10 - existingCount);
  const update = (id: number, change: Partial<ConfirmedDefect>) =>
    setDefects((current) => current.map((defect) => defect.id === id ? { ...defect, ...change } : defect));
  const add = () => setDefects((current) =>
    current.length >= remaining ? current : [...current, initialDefect(Math.max(...current.map((d) => d.id), 0) + 1)]
  );
  return (
    <form action={action} className="form-grid">
      <div className="field field-wide assignment-confirmation">
        <h4>Confirmed defects for maintenance</h4>
        <p className="subtle">Add each verified defect separately. Maintenance receives one job per defect ({existingCount + defects.length}/10).</p>
      </div>
      <input type="hidden" name="defects" value={JSON.stringify(defects.map(({area,item,issue,note}) => ({area,item,issue,note})))}/>
      {defects.map((defect, index) => {
        const items = Object.keys(defectOptions[defect.area]);
        const issues = defectOptions[defect.area][defect.item as keyof (typeof defectOptions)[typeof defect.area]] as readonly string[];
        return <div key={defect.id} className="field field-wide panel" style={{padding:16}}>
          <div className="section-head"><h4>Defect {index + 1}</h4>{defects.length > 1 &&
            <button type="button" className="button button-secondary" onClick={() => setDefects((current) => current.filter((row) => row.id !== defect.id))}>Remove</button>}</div>
          <div className="form-grid">
            <label className="field"><span>Area *</span><select value={defect.area} onChange={(event) => {
              const area = event.target.value as DefectArea;
              const item = Object.keys(defectOptions[area])[0];
              const issue = (defectOptions[area][item as keyof (typeof defectOptions)[typeof area]] as readonly string[])[0];
              update(defect.id, { area, item, issue });
            }}>{Object.keys(defectOptions).map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="field"><span>Defect Item *</span><select value={defect.item} onChange={(event) => {
              const item = event.target.value;
              const issue = (defectOptions[defect.area][item as keyof (typeof defectOptions)[typeof defect.area]] as readonly string[])[0];
              update(defect.id, { item, issue });
            }}>{items.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="field"><span>Problem *</span><select value={defect.issue} onChange={(event) => update(defect.id, {issue:event.target.value})}>{issues.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="field field-wide"><span>Location / Other Note</span><input value={defect.note} onChange={(event) => update(defect.id, {note:event.target.value})} maxLength={500} placeholder="Near window, beside main door, or describe other defect"/></label>
          </div>
        </div>;
      })}
      {defects.length < remaining && <div className="field field-wide"><button type="button" className="button button-secondary" onClick={add}>+ Add another defect</button></div>}
      <div className="field field-wide"><h4>Maintenance Appointment</h4><p className="subtle">The tenant&apos;s preferred date and time are filled in when an appointment is required. Change them here if the student arranges another time.</p></div>
      <label className="field"><span>Maintenance Date{requiresAppointment ? " *" : ""}</span><input name="appointmentDate" type="date" defaultValue={preferred?.date || ""} required={requiresAppointment}/></label>
      <label className="field"><span>Maintenance Time{requiresAppointment ? " *" : ""}</span><select name="appointmentTime" defaultValue={preferred?.time || ""} required={requiresAppointment}><option value="">{requiresAppointment ? "Choose a time slot" : "No appointment"}</option>{appointmentTimeSlots.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}</select></label>
      <label className="field"><span>Assigned Staff *</span><select name="staffId" required><option value="">Choose eligible staff</option>{eligible.map((staff) => <option key={staff.id} value={staff.id}>{staff.full_name}</option>)}</select></label>
      <label className="field field-wide"><span>Remarks</span><textarea name="remarks" rows={3} maxLength={1000}/></label>
      <div className="field field-wide"><button className="button" type="submit">Approve &amp; create {defects.length} {defects.length === 1 ? "job" : "jobs"}</button></div>
    </form>
  );
}
