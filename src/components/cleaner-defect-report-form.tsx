"use client";

import { useState } from "react";
import { createCleanerDefectReport } from "@/app/(dashboard)/staff/report-defect/actions";
import { CheckoutDefectBuilder } from "@/components/checkout-defect-builder";

export function CleanerDefectReportForm({ blocks }: { blocks: { id: number; code: string }[] }) {
  const [locationType, setLocationType] = useState<"room" | "common_area">("room");
  const [commonArea, setCommonArea] = useState("");

  return (
    <form action={createCleanerDefectReport} className="panel cleaner-report-page-form">
      <div className="form-grid">
        <label className="field"><span>Report location *</span>
          <select name="locationType" value={locationType} onChange={(event) => { setLocationType(event.target.value as "room" | "common_area"); setCommonArea(""); }}>
            <option value="room">Room</option><option value="common_area">Common Area</option>
          </select>
        </label>
        <label className="field"><span>Block *</span>
          <select name="blockId" required><option value="">Choose block</option>{blocks.map((block) => <option key={block.id} value={block.id}>Block {block.code}</option>)}</select>
        </label>
        {locationType === "room" ? (
          <label className="field"><span>Room *</span><input name="room" required placeholder="e.g. A-525" /></label>
        ) : (
          <label className="field"><span>Common area *</span>
            <select name="commonArea" required value={commonArea} onChange={(event) => setCommonArea(event.target.value)}>
              <option value="">Choose common area</option>
              <option>Corridor</option><option>Balcony</option><option>Lobby</option><option>Common Bathroom</option><option>Staircase</option><option>Drying Area</option><option>Visitor Room</option><option>Utility Room</option><option>Pantry</option><option>Other</option>
            </select>
          </label>
        )}
        <label className="field"><span>Priority *</span>
          <select name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
        </label>
      </div>

      <div className="cleaner-report-builder">
        <h3>Defects found</h3>
        <p className="subtle">Add every issue you found. Admin will review and assign the correct Maintenance work.</p>
        <CheckoutDefectBuilder
          fieldName="defectsJson"
          emptyMessage="Add at least one defect before sending this report."
          allowedGroups={locationType === "room" ? ["Room", "Bathroom"] : ["Common Area"]}
          fixedCommonArea={locationType === "common_area" ? commonArea : ""}
          groupLabel="Part of room"
        />
      </div>
      <button className="button">Send report to Admin</button>
    </form>
  );
}
