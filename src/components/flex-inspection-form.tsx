"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Download, X } from "lucide-react";
import {
  FLEX_REMARK_MAX_LENGTH,
  FLEX_REPORT_LABELS,
  type FlexGroup,
  type FlexInspectionSnapshot,
  type FlexReportType,
  type FlexSaveInput,
} from "@/lib/flex-inspection";
import { saveFlexInspection } from "@/lib/flex-inspection-actions";
import styles from "./flex-inspection-form.module.css";

type Block = FlexGroup["block"];
type Level = "all" | "common" | number;

type InspectionLocation = {
  block: Block;
  level: FlexGroup["level"];
  location: string;
  groups: FlexGroup[];
};

const reportTypes: FlexReportType[] = ["fire-extinguisher", "exit-sign", "emergency-light"];
const blocks: Block[] = ["C", "D"];

function organizeInspection(groups: FlexGroup[]) {
  const locations = new Map<string, InspectionLocation>();
  const levels: Record<Block, Set<number | null>> = { C: new Set(), D: new Set() };
  let unitCount = 0;
  for (const group of groups) {
    const key = [group.block, group.level, group.location].join("/");
    const location = locations.get(key);
    if (location) {
      location.groups.push(group);
    } else {
      locations.set(key, { block: group.block, level: group.level, location: group.location, groups: [group] });
    }
    levels[group.block].add(group.level);
    unitCount += group.units.length;
  }
  const orderLevels = (a: number | null, b: number | null) => (a ?? Infinity) - (b ?? Infinity);
  return {
    inspectionLocations: [...locations.values()].sort((a, b) => a.block.localeCompare(b.block) || orderLevels(a.level, b.level)),
    levelOptions: { C: [...levels.C].sort(orderLevels), D: [...levels.D].sort(orderLevels) },
    unitCount,
  };
}

function formatLevel(level: number | null) {
  return level === null ? "Common areas" : "Level " + level;
}

export function FlexInspectionForm({ inspection, groups, today }: {
  inspection: FlexInspectionSnapshot;
  groups: FlexGroup[];
  today: string;
}) {
  const { inspectionLocations, levelOptions, unitCount } = useMemo(() => organizeInspection(groups), [groups]);
  const [saved, setSaved] = useState(inspection);
  const [exceptions, setExceptions] = useState(inspection.exceptions);
  const [inspectionDate, setInspectionDate] = useState(
    inspection.inspectionDate ?? (today.startsWith(inspection.period + "-") ? today : ""),
  );
  const [block, setBlock] = useState<Block>("C");
  const [level, setLevel] = useState<Level>(levelOptions.C[0] ?? "all");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [pending, setPending] = useState<"draft" | "complete" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const saving = useRef(false);
  const inspectionDateInput = useRef<HTMLInputElement>(null);

  const completed = saved.completedAt !== null;
  const issueCount = Object.keys(exceptions).length;
  const missingRemarks = Object.values(exceptions).filter((remark) => !remark.trim()).length;
  const missingRemarkError = showMissing && missingRemarks > 0
    ? "Enter a remark for every unit marked X before completing the inspection."
    : "";
  const visibleLocations = useMemo(() => inspectionLocations.filter((location) =>
    issuesOnly
      ? location.groups.some((group) => group.units.some((unit) => Object.hasOwn(exceptions, unit.id)))
      : location.block === block && (level === "all" || location.level === (level === "common" ? null : level)),
  ), [block, exceptions, inspectionLocations, issuesOnly, level]);

  function switchBlock(next: Block) {
    setBlock(next);
    if (level === "common" && !levelOptions[next].includes(null)) setLevel("all");
    if (typeof level === "number" && !levelOptions[next].includes(level)) setLevel(levelOptions[next][0] ?? "all");
  }

  function markUnit(id: string, isIssue: boolean) {
    setMessage("");
    setExceptions((previous) => {
      if (Object.hasOwn(previous, id) === isIssue) return previous;
      if (isIssue) return { ...previous, [id]: "" };
      const remaining = { ...previous };
      delete remaining[id];
      return remaining;
    });
  }

  function updateRemark(id: string, remark: string) {
    setMessage("");
    setExceptions((previous) => ({ ...previous, [id]: remark }));
  }

  async function persist(complete: boolean) {
    if (saving.current || completed || needsReload) return;
    setError("");
    setMessage("");
    if (complete && missingRemarks) {
      setShowMissing(true);
      setIssuesOnly(true);
      return;
    }
    if (!inspectionDate || inspectionDate > today) {
      setError("Enter an inspection date on or before today.");
      inspectionDateInput.current?.focus();
      return;
    }

    saving.current = true;
    setPending(complete ? "complete" : "draft");
    const input: FlexSaveInput = {
      period: saved.period, revision: saved.revision, exceptions, inspectionDate, complete,
    };
    try {
      const result = await saveFlexInspection(input);
      if (!result.ok) {
        setError(result.message);
        if (result.code === "conflict") setNeedsReload(true);
        return;
      }
      setSaved(result.inspection);
      setExceptions(result.inspection.exceptions);
      setShowMissing(false);
      setMessage(complete ? "Inspection completed. The three reports are ready." : "Draft saved.");
    } catch {
      setError("The inspection could not be saved. Your changes are still open. Please try again.");
    } finally {
      saving.current = false;
      setPending(null);
    }
  }

  return (
    <section className={styles.inspection} aria-label="Flex inspection checklist" aria-busy={pending !== null}>
      <div className={styles.controls}>
        <div className={styles.statusLine}>
          <div>
            <strong>Inspection checklist</strong>
            <p>{unitCount} units across Blocks C and D · {issueCount} {issueCount === 1 ? "issue" : "issues"}</p>
          </div>
          {completed ? <span className={styles.complete}><Check aria-hidden="true" size={16} /> Complete</span> : null}
        </div>

        {completed ? (
          <>
            <p className={styles.signedBy}>Inspected by {saved.inspectedByName} · {saved.inspectionDate}</p>
            <div className={styles.downloads} aria-label="Inspection reports">
              {reportTypes.map((report) => (
                <a className={styles.download} key={report} href={"/api/flex-inspections/" + saved.period + "/" + report}>
                  <Download aria-hidden="true" size={16} />
                  {FLEX_REPORT_LABELS[report]} PDF
                </a>
              ))}
            </div>
          </>
        ) : (
          <p className={styles.instructions}>All items start with ✓. Tap X for a fault and add a remark. Complete once you have checked both blocks.</p>
        )}
        <p className={styles.reportNote}>
          Block C has 60 emergency lights on the checklist, including Lift Motor Room and FAP Room.
          The Flex report displays the original total of 58.
        </p>

        <div className={styles.filters}>
          {!issuesOnly ? (
            <>
              <div className={styles.blocks} role="group" aria-label="Block">
                {blocks.map((choice) => (
                  <button key={choice} type="button" aria-pressed={block === choice} onClick={() => switchBlock(choice)}>
                    Block {choice}
                  </button>
                ))}
              </div>
              <label className={styles.level}>
                <span className={styles.srOnly}>Level</span>
                <select value={level} onChange={(event) => {
                  const value = event.target.value;
                  setLevel(value === "all" || value === "common" ? value : Number(value));
                }}>
                  <option value="all">All levels</option>
                  {levelOptions[block].map((option) => (
                    <option key={option ?? "common"} value={option ?? "common"}>{formatLevel(option)}</option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          {issueCount > 0 || issuesOnly ? (
            <button className={styles.issueFilter} type="button" onClick={() => setIssuesOnly((value) => !value)}>
              {issuesOnly ? "Back to all checks" : "View all issues (" + issueCount + ")"}
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.locations}>
        {visibleLocations.map((location) => (
          <section className={styles.location} key={[location.block, location.level, location.location].join("/")}>
            <div className={styles.locationHeading}>
              <h3>{location.location}</h3>
              {issuesOnly || level === "all" ? <span>Block {location.block} · {formatLevel(location.level)}</span> : null}
            </div>
            {location.groups.map((group) => {
              const units = issuesOnly ? group.units.filter((unit) => Object.hasOwn(exceptions, unit.id)) : group.units;
              if (!units.length) return null;
              return (
                <div className={styles.equipment} key={group.id}>
                  <h4>{FLEX_REPORT_LABELS[group.report]}</h4>
                  <ul className={styles.units}>
                    {units.map((unit) => {
                      const hasIssue = Object.hasOwn(exceptions, unit.id);
                      const accessibleUnit = [FLEX_REPORT_LABELS[group.report], unit.label, location.location,
                        "Block " + location.block, formatLevel(location.level)].join(", ");
                      return (
                        <li key={unit.id} className={styles.unit}>
                          <div className={styles.unitRow}>
                            <span>{unit.label}</span>
                            {completed ? (
                              <span className={hasIssue ? styles.issueStatus : styles.goodStatus}>
                                {hasIssue ? <X aria-hidden="true" size={14} /> : <Check aria-hidden="true" size={14} />}
                                {hasIssue ? "Fault" : "Good"}
                              </span>
                            ) : (
                              <div className={styles.result} role="group" aria-label={accessibleUnit}>
                                <button type="button" className={styles.good} aria-pressed={!hasIssue}
                                  aria-label="Good" disabled={pending !== null} onClick={() => markUnit(unit.id, false)}>
                                  <Check aria-hidden="true" size={20} />
                                </button>
                                <button type="button" className={styles.fault} aria-pressed={hasIssue}
                                  aria-label="Fault" disabled={pending !== null} onClick={() => markUnit(unit.id, true)}>
                                  <X aria-hidden="true" size={20} />
                                </button>
                              </div>
                            )}
                          </div>
                          {hasIssue && completed ? <p className={styles.savedRemark}>{exceptions[unit.id]}</p> : null}
                          {hasIssue && !completed ? (
                            <label className={styles.remark}>
                              <span>Remark <span className={styles.srOnly}>for {accessibleUnit}</span></span>
                              <textarea rows={2} maxLength={FLEX_REMARK_MAX_LENGTH} placeholder="Describe the fault" value={exceptions[unit.id]}
                                disabled={pending !== null} aria-invalid={showMissing && !exceptions[unit.id].trim()}
                                onChange={(event) => updateRemark(unit.id, event.target.value)} />
                            </label>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </section>
        ))}
        {!visibleLocations.length ? <p className={styles.empty}>{issuesOnly ? "No issues recorded." : "No equipment at this level."}</p> : null}
      </div>

      {!completed ? (
        <div className={styles.footer}>
          {error || missingRemarkError ? (
            <p className={styles.error} role="alert">
              {error || missingRemarkError} {needsReload ? <button className={styles.reload} type="button" onClick={() => window.location.reload()}>Reload saved inspection</button> : null}
            </p>
          ) : null}
          <div className={styles.actions}>
            <label className={styles.date}>
              <span>Inspection date</span>
              <input ref={inspectionDateInput} type="date" max={today} value={inspectionDate} disabled={pending !== null}
                onChange={(event) => { setInspectionDate(event.target.value); setMessage(""); }} />
            </label>
            <button className={styles.secondaryAction} type="button" disabled={pending !== null || needsReload} onClick={() => void persist(false)}>
              {pending === "draft" ? "Saving…" : "Save draft"}
            </button>
            <button className={styles.primaryAction} type="button" disabled={pending !== null || needsReload} onClick={() => void persist(true)}>
              <Check aria-hidden="true" size={18} />
              {pending === "complete" ? "Completing…" : "Complete inspection"}
            </button>
          </div>
          {message ? <p className={styles.success} role="status">{message}</p> : null}
        </div>
      ) : message ? <p className={styles.srOnly} role="status">{message}</p> : null}
    </section>
  );
}
