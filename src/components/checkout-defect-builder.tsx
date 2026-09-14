"use client";

import { useEffect, useMemo, useState } from "react";
import { commonAreas, defectCatalog } from "@/lib/defect-catalog";

type Area = "Room" | "Bathroom" | "Common Area";
type DefectDraft = {
  group: Area;
  item: string;
  issue: string;
  otherIssue: string;
  exactLocation: string;
  commonArea: string;
};

const initialDraft: DefectDraft = {
  group: "Room", item: "", issue: "", otherIssue: "", exactLocation: "", commonArea: "",
};

export function CheckoutDefectBuilder({
  fieldName = "defectsJson",
  emptyMessage = "Add at least one defect.",
  allowedGroups = ["Room", "Bathroom", "Common Area"] as Area[],
  fixedCommonArea = "",
  groupLabel = "Area",
}: {
  fieldName?: string;
  emptyMessage?: string;
  allowedGroups?: Area[];
  fixedCommonArea?: string;
  groupLabel?: string;
}) {
  const [draft, setDraft] = useState<DefectDraft>(initialDraft);
  const [defects, setDefects] = useState<string[]>([]);
  const items = useMemo(() => defectCatalog.filter((entry) => entry.group === draft.group), [draft.group]);

  useEffect(() => {
    if (!allowedGroups.includes(draft.group)) {
      setDraft({ ...initialDraft, group: allowedGroups[0] || "Room" });
    }
  }, [allowedGroups, draft.group]);

  const selectedItem = items.find((entry) => entry.item === draft.item);
  const isFixedCommonArea = draft.group === "Common Area" && Boolean(fixedCommonArea);

  function resetForArea(group: Area) {
    setDraft({ ...initialDraft, group });
  }

  function addDefect() {
    const commonArea = fixedCommonArea || draft.commonArea;
    if (!draft.item || !draft.issue || (draft.issue === "Other" && !draft.otherIssue.trim()) || (draft.group === "Common Area" && !commonArea)) return;
    const issue = draft.issue === "Other" ? draft.otherIssue.trim() : draft.issue;
    const area = draft.group === "Common Area" ? `Common Area · ${commonArea}` : draft.group;
    const location = draft.exactLocation.trim() ? ` · ${draft.exactLocation.trim()}` : "";
    setDefects((current) => [...current, `${area} · ${draft.item} — ${issue}${location}`]);
    setDraft({ ...initialDraft, group: allowedGroups[0] || "Room" });
  }

  return (
    <div className="checkout-defect-builder">
      <input type="hidden" name={fieldName} value={JSON.stringify(defects)} />
      <div className="checkout-defect-fields">
        {allowedGroups.length > 1 && (
          <label><span>{groupLabel}</span>
            <select value={draft.group} onChange={(event) => resetForArea(event.target.value as Area)}>
              {allowedGroups.map((group) => <option key={group} value={group}>{group}</option>)}
            </select>
          </label>
        )}

        {draft.group === "Common Area" && !isFixedCommonArea && (
          <label><span>Common area</span>
            <select value={draft.commonArea} onChange={(event) => setDraft({ ...draft, commonArea: event.target.value })}>
              <option value="">Select area</option>{commonAreas.map((area) => <option key={area} value={area}>{area}</option>)}
            </select>
          </label>
        )}

        <label><span>Item</span>
          <select value={draft.item} onChange={(event) => setDraft({ ...draft, item: event.target.value, issue: "" })}>
            <option value="">Select item</option>{items.map((item) => <option key={item.item} value={item.item}>{item.item}</option>)}
          </select>
        </label>

        <label><span>Issue</span>
          <select value={draft.issue} disabled={!selectedItem} onChange={(event) => setDraft({ ...draft, issue: event.target.value })}>
            <option value="">Select issue</option>{selectedItem?.issues.map((issue) => <option key={issue} value={issue}>{issue}</option>)}
          </select>
        </label>

        {draft.issue === "Other" && (
          <label><span>Specify issue</span><input value={draft.otherIssue} onChange={(event) => setDraft({ ...draft, otherIssue: event.target.value })} placeholder="Describe the issue" /></label>
        )}

        <label><span>Exact location</span>
          <input value={draft.exactLocation} onChange={(event) => setDraft({ ...draft, exactLocation: event.target.value })} placeholder={draft.group === "Common Area" ? "e.g. Level 5, near A523" : "e.g. Near window / bathroom entrance"} />
        </label>
      </div>

      <button type="button" className="button secondary" onClick={addDefect}>Add defect</button>
      <div className="checkout-defect-added" aria-live="polite">
        {!defects.length ? <p className="subtle">{emptyMessage}</p> : defects.map((defect, index) => (
          <div key={`${defect}-${index}`}><span>{index + 1}. {defect}</span><button type="button" onClick={() => setDefects((current) => current.filter((_, position) => position !== index))}>Remove</button></div>
        ))}
      </div>
    </div>
  );
}
