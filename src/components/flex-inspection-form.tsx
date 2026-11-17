"use client";

import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { ArrowDown, ArrowUp, Check, Download, FolderOpen, X } from "lucide-react";
import {
  AB_REPORT_LABELS,
  FLEX_REMARK_MAX_LENGTH,
  FLEX_REPORT_LABELS,
  type AbReportType,
  type FlexInspectionSnapshot,
  type FlexSaveInput,
  type InspectionGroup,
} from "@/lib/flex-inspection";
import { downloadAbInspectionPreviewReport, downloadFlexPreviewReport, saveAbFireSafetyInspection, saveFlexInspection } from "@/lib/flex-inspection-actions";
import type { FlexInspectionMailRecipients } from "@/lib/flex-inspection-mail-settings";
import type { FlexReview, FlexReviewer } from "@/lib/flex-inspection-review";
import { FlexReviewPanel } from "./flex-review-panel";
import styles from "./flex-inspection-form.module.css";

type Block = InspectionGroup["block"];
type Level = "all" | "common" | number;
type FloorDirection = 1 | -1;

type InspectionLocation = {
  block: Block;
  level: InspectionGroup["level"];
  location: string;
  groups: InspectionGroup[];
};

const inspectionOptions = {
  ab: {
    blocks: ["A", "B", "Other"] as const,
    reportTypes: Object.keys(AB_REPORT_LABELS) as AbReportType[],
    blockLabel: "Blocks A and B and other areas",
  },
  cd: {
    blocks: ["C", "D"] as const,
    reportTypes: Object.keys(FLEX_REPORT_LABELS) as AbReportType[],
    blockLabel: "Blocks C and D",
  },
};

function organizeInspection(groups: InspectionGroup[]) {
  const locations = new Map<string, InspectionLocation>();
  const levels: Record<Block, Set<number | null>> = {
    A: new Set(), B: new Set(), C: new Set(), D: new Set(), Other: new Set(),
  };
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
  const levelOptions = Object.fromEntries(Object.entries(levels).map(([block, values]) => [
    block, [...values].sort(orderLevels),
  ])) as Record<Block, (number | null)[]>;
  return {
    inspectionLocations: [...locations.values()].sort((a, b) => a.block.localeCompare(b.block) || orderLevels(a.level, b.level)),
    levelOptions,
    unitCount,
  };
}

function formatLevel(level: number | null) {
  return level === null ? "Common areas" : "Level " + level;
}

function formatBlock(block: Block) {
  return block === "Other" ? "Other areas" : `Block ${block}`;
}

function FloorNavigation({ position, block, level, direction, nextLevel, headingRef, onNext }: {
  position: "top" | "bottom";
  block: Block;
  level: number;
  direction: FloorDirection;
  nextLevel: number | undefined;
  headingRef?: Ref<HTMLHeadingElement>;
  onNext: () => void;
}) {
  const destination = nextLevel === undefined ? undefined : formatLevel(nextLevel);
  const Arrow = direction === 1 ? ArrowUp : ArrowDown;

  return (
    <nav className={styles.floorNavigation} aria-label={`Floor navigation (${position})`}>
      {position === "top" ? (
        <h3 ref={headingRef} tabIndex={-1} className={styles.floorHeading}>
          {formatBlock(block)} · {formatLevel(level)}
        </h3>
      ) : (
        <span className={styles.floorHeading}>{formatBlock(block)} · {formatLevel(level)}</span>
      )}
      <button className={styles.nextFloor} type="button" disabled={!destination}
        aria-label={destination ? `Next: ${destination}` : "Next"} onClick={onNext}>
        Next
        {destination ? <><span>{destination}</span><Arrow size={16} aria-hidden="true" /></> : null}
      </button>
    </nav>
  );
}

export function FlexInspectionForm({ inspection, groups, today, scope = "cd", preview = false, review, reviewer = null, recipients, scheduledDate }: {
  inspection: FlexInspectionSnapshot;
  groups: InspectionGroup[];
  today: string;
  scope?: "ab" | "cd";
  preview?: boolean;
  review?: FlexReview | null;
  reviewer?: FlexReviewer | null;
  recipients?: FlexInspectionMailRecipients | null;
  scheduledDate?: string;
}) {
  const isAb = scope === "ab";
  const { blocks, reportTypes, blockLabel } = inspectionOptions[scope];
  const { inspectionLocations, levelOptions, unitCount } = useMemo(() => organizeInspection(groups), [groups]);
  const [saved, setSaved] = useState(inspection);
  const [exceptions, setExceptions] = useState(inspection.exceptions);
  const [inspectionDate, setInspectionDate] = useState(
    inspection.inspectionDate ?? (today.startsWith(inspection.period + "-") ? today : ""),
  );
  const [block, setBlock] = useState<Block>(blocks[0]);
  const [level, setLevel] = useState<Level>(levelOptions[blocks[0]][0] ?? "all");
  const [floorDirection, setFloorDirection] = useState<FloorDirection>(1);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [pending, setPending] = useState<"draft" | "complete" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const [preparingPdf, setPreparingPdf] = useState<AbReportType | null>(null);
  const storageKey = isAb ? `ab-preview-inspection-${inspection.period}` : `flex-preview-inspection-${inspection.period}`;
  const saving = useRef(false);
  const inspectionDateInput = useRef<HTMLInputElement>(null);
  const floorHeading = useRef<HTMLHeadingElement>(null);
  const followedNext = useRef(false);

  useEffect(() => {
    if (!preview) return;
    try {
      const value = sessionStorage.getItem(storageKey);
      if (!value) return;
      const snapshot: FlexInspectionSnapshot = JSON.parse(value);
      setSaved(snapshot);
      setExceptions(snapshot.exceptions);
      setInspectionDate(snapshot.inspectionDate ?? "");
    } catch {
      // The preview remains usable when browser storage is disabled.
    }
  }, [preview, storageKey]);

  useEffect(() => {
    if (!followedNext.current) return;
    followedNext.current = false;
    floorHeading.current?.focus({ preventScroll: true });
    floorHeading.current?.scrollIntoView?.({ block: "start" });
  }, [level]);

  const completed = saved.completedAt !== null;
  const floor = typeof level === "number" && !issuesOnly ? level : null;
  const numberedLevels = levelOptions[block].filter((option) => option !== null);
  const nextLevel = floor === null ? undefined : numberedLevels[numberedLevels.indexOf(floor) + floorDirection];
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

  function selectLevel(nextLevel: Level, nextBlock: Block) {
    setLevel(nextLevel);
    if (typeof nextLevel !== "number") return;

    const numbered = levelOptions[nextBlock].filter((option) => option !== null);
    const lowest = numbered[0] ?? nextLevel;
    const highest = numbered[numbered.length - 1] ?? nextLevel;
    setFloorDirection(nextLevel - lowest > highest - nextLevel ? -1 : 1);
  }

  function switchBlock(next: Block) {
    if (next === block) return;
    setBlock(next);
    if (level === "common" && !levelOptions[next].includes(null)) setLevel("all");
    if (typeof level === "number") {
      selectLevel(levelOptions[next].includes(level) ? level : (levelOptions[next][0] ?? "all"), next);
    }
  }

  function advanceFloor() {
    if (nextLevel === undefined) return;
    followedNext.current = true;
    setLevel(nextLevel);
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
      const result = await (isAb ? saveAbFireSafetyInspection(input) : saveFlexInspection(input));
      if (!result.ok) {
        setError(result.message);
        if (result.code === "conflict") setNeedsReload(true);
        return;
      }
      setSaved(result.inspection);
      setExceptions(result.inspection.exceptions);
      if (preview) {
        try { sessionStorage.setItem(storageKey, JSON.stringify(result.inspection)); } catch { /* Preview state remains on screen. */ }
      }
      setShowMissing(false);
      setMessage(complete ? "Inspection completed. The reports are ready." : "Draft saved.");
    } catch {
      setError("The inspection could not be saved. Your changes are still open. Please try again.");
    } finally {
      saving.current = false;
      setPending(null);
    }
  }

  async function downloadPreview(report: AbReportType) {
    if (!saved.inspectionDate || preparingPdf) return;
    setPreparingPdf(report);
    setError("");
    try {
      const download = isAb ? downloadAbInspectionPreviewReport : downloadFlexPreviewReport;
      const result = await download(report, {
        period: saved.period, revision: saved.revision, exceptions: saved.exceptions,
        inspectionDate: saved.inspectionDate, complete: true,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const bytes = Uint8Array.from(atob(result.content), (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${isAb ? "AB" : "Flex"}-Preview-${report}-${saved.period}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("The preview report could not be downloaded. Try again.");
    } finally {
      setPreparingPdf(null);
    }
  }

  return (
    <section className={styles.inspection} aria-label={isAb ? "Block A and B inspection checklist" : "Flex inspection checklist"} aria-busy={pending !== null}>
      <div className={styles.controls}>
        {preview ? <p className={styles.reportNote}>{isAb
          ? "Trial version. Drafts and completions are saved in this browser."
          : "Trial version. This tab uses sample inspection records and simulates email delivery."}</p> : null}
        <div className={styles.statusLine}>
          <div>
            <strong>Inspection checklist</strong>
            <p>{unitCount} units across {blockLabel} · {issueCount} {issueCount === 1 ? "issue" : "issues"}</p>
          </div>
          {completed ? <span className={styles.complete}><Check aria-hidden="true" size={16} /> Complete</span> : null}
        </div>

        {completed ? (
          <>
            <p className={styles.signedBy}>Inspected by {saved.inspectedByName} · {saved.inspectionDate}</p>
            <div className={styles.downloads} aria-label="Inspection reports">
              {reportTypes.map((report) => preview ? (
                <button type="button" className={styles.download} key={report}
                  disabled={preparingPdf !== null} onClick={() => void downloadPreview(report)}>
                  <Download aria-hidden="true" size={16} />
                  {preparingPdf === report ? "Preparing PDF…" : `${AB_REPORT_LABELS[report]} PDF`}
                </button>
              ) : (
                <a className={styles.download} key={report}
                  href={`/api/flex-inspections/${saved.period}/${report}${isAb ? "?scope=ab" : ""}`}>
                  <Download aria-hidden="true" size={16} />
                  {AB_REPORT_LABELS[report]} PDF
                </a>
              ))}
              {!preview ? (
                <a className={styles.download} href={`/documents/fire-safety-inspections/${scope}`}>
                  <FolderOpen aria-hidden="true" size={16} />
                  Open Documents archive
                </a>
              ) : null}
            </div>
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            {!isAb && review ? <FlexReviewPanel period={saved.period} initial={review} reviewer={reviewer}
              preview={preview} recipients={recipients} scheduledDate={scheduledDate} /> : null}
            {!isAb && review === null ? <p className={styles.error} role="alert">Verification status could not be loaded. Refresh this page.</p> : null}
          </>
        ) : (
          <p className={styles.instructions}>All items start with ✓. Tap X for a fault and add a remark. Complete once you have checked {isAb ? "both blocks and other areas" : "both blocks"}.</p>
        )}
        {!isAb ? <p className={styles.reportNote}>
          Block C has 60 emergency lights on the checklist, including Lift Motor Room and FAP Room.
          The Flex report displays the original total of 58.
        </p> : null}

        <div className={styles.filters}>
          {!issuesOnly ? (
            <>
              <div className={styles.blocks} role="group" aria-label="Block">
                {blocks.map((choice) => (
                  <button key={choice} type="button" aria-pressed={block === choice} onClick={() => switchBlock(choice)}>
                    {formatBlock(choice)}
                  </button>
                ))}
              </div>
              <label className={styles.level}>
                <span className={styles.srOnly}>Level</span>
                <select value={level} onChange={(event) => {
                  const value = event.target.value;
                  selectLevel(value === "all" || value === "common" ? value : Number(value), block);
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

      {floor !== null ? (
        <FloorNavigation position="top" block={block} level={floor} direction={floorDirection}
          nextLevel={nextLevel} onNext={advanceFloor} headingRef={floorHeading} />
      ) : null}

      <div className={styles.locations}>
        {visibleLocations.map((location) => (
          <section className={styles.location} key={[location.block, location.level, location.location].join("/")}>
            <div className={styles.locationHeading}>
              <h3>{location.location}</h3>
              {issuesOnly || level === "all" ? <span>{formatBlock(location.block)}{location.level === null && location.block === "Other" ? "" : ` · ${formatLevel(location.level)}`}</span> : null}
            </div>
            {location.groups.map((group) => {
              const units = issuesOnly ? group.units.filter((unit) => Object.hasOwn(exceptions, unit.id)) : group.units;
              if (!units.length && (issuesOnly || !group.note)) return null;
              return (
                <div className={styles.equipment} key={group.id}>
                  <h4>{AB_REPORT_LABELS[group.report]}</h4>
                  {group.note ? <p className={styles.locationNote}>{group.note}</p> : null}
                  {units.length ? <ul className={styles.units}>
                    {units.map((unit) => {
                      const hasIssue = Object.hasOwn(exceptions, unit.id);
                      const accessibleUnit = [AB_REPORT_LABELS[group.report], unit.label, location.location,
                        formatBlock(location.block), formatLevel(location.level)].join(", ");
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
                  </ul> : null}
                </div>
              );
            })}
          </section>
        ))}
        {!visibleLocations.length ? <p className={styles.empty}>{issuesOnly ? "No issues recorded." : "No equipment at this level."}</p> : null}
      </div>

      {floor !== null ? (
        <FloorNavigation position="bottom" block={block} level={floor} direction={floorDirection}
          nextLevel={nextLevel} onNext={advanceFloor} />
      ) : null}

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
