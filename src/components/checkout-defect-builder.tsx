"use client";

import { useMemo, useState } from "react";
import { commonAreas, defectCatalog } from "@/lib/defect-catalog";

type Area = "Room" | "Bathroom" | "Common Area";
type DefectDraft = { group: Area; item: string; issue: string; otherIssue: string; exactLocation: string; commonArea: string };

const emptyDraft = (): DefectDraft => ({ group: "Room", item: "", issue: "", otherIssue: "", exactLocation: "", commonArea: "" });

export function CheckoutDefectBuilder() {
  const [draft, setDraft] = useState<DefectDraft>(emptyDraft);
  const [defects, setDefects] = useState<string[]>([]);
  const items = useMemo(() => defectCatalog.filter((entry) => entry.group === draft.group), [draft.group]);
  const selected = items.find((entry) => entry.item === draft.item);

  const set = <K extends keyof DefectDraft>(key: K, value: DefectDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  function addDefect() {
    if (!draft.item || !draft.issue || (draft.issue === "Other" && !draft.otherIssue.trim())) return;
    const issue = draft.issue === "Other" ? draft.otherIssue.trim() : draft.issue;
    const area = draft.group === "Common Area" && draft.commonArea ? `Common Area · ${draft.commonArea}` : draft.group;
    const detail = draft.exactLocation.trim() ? ` · ${draft.exactLocation.trim()}` : "";
    setDefects((current) => [...current, `${area} · ${draft.item} — ${issue}${detail}`]);
    setDraft(emptyDraft());
  }

  return (
    <div className="checkout-defect-builder">
      <input type="hidden" name="defectsJson" value={JSON.stringify(defects)} />
      <div className="checkout-defect-fields">
        <label><span>Area</span><select value={draft.group} onChange={(event) => setDraft("group", event.target.value as Area)}><option value="Room">Room</option><option value="Bathroom">Bathroom</option><option value="Common Area">Common Area</option></select></label>
        {draft.group === "Common Area" && <label><span>Common area</span><select value={draft.commonArea} onChange={(event) => set("commonArea", event.target.value)}><option value="">Select area</option>{commonAreas.map((area) => <option key={area}>{area}</option>)}</select></label>}
        <label><span>Item</span><select value={draft.item} onChange={(event) => { set("item", event.target.value); set("issue", ""); }}><option value="">Select item</option>{items.map((item) => <option key={item.item}>{item.item}</option>)}</select></label>
        <label><span>Issue</span><select value={draft.issue} disabled={!selected} onChange={(event) => set("issue", event.target.value)}><option value="">Select issue</option>{selected?.issues.map((issue) => <option key={issue}>{issue}</option>)}</select></label>
        {draft.issue === "Other" && <label><span>Specify issue</span><input value={draft.otherIssue} onChange={(event) => set("otherIssue", event.target.value)} placeholder="Describe the issue" /></label>}
        <label><span>Exact location</span><input value={draft.exactLocation} onChange={(event) => set("exactLocation", event.target.value)} placeholder={draft.group === "Common Area" ? "e.g. Level 5, near A523" : "e.g. Near window / bathroom entrance"} /></label>
      </div>
      <button type="button" className="button secondary" onClick={addDefect}>Add defect</button>
      <div className="checkout-defect-added" aria-live="polite">
        {!defects.length ? <p className="subtle">Add at least one defect before creating this room record.</p> : defects.map((defect, index) => <div key={`${defect}-${index}`}><span>{index + 1}. {defect}</span><button type="button" onClick={() => setDefects((current) => current.filter((_, position) => position !== index))}>Remove</button></div>)}
      </div>
    </div>
  );
}
