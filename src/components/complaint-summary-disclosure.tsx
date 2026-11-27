"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ComplaintSummaryResult } from "./complaint-summary";

export function ComplaintSummaryDisclosure({ children, initiallyOpen, initialResult, loadOnOpen }: {
  children: ReactNode;
  initiallyOpen: boolean;
  initialResult: ComplaintSummaryResult | null;
  loadOnOpen: () => Promise<ComplaintSummaryResult>;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const requested = useRef(false);
  const [loaded, setLoaded] = useState<ComplaintSummaryResult | null>(null);
  const result = initialResult ?? loaded;
  const load = useCallback(() => {
    if (!details.current?.open || initialResult || requested.current) return;
    requested.current = true;
    loadOnOpen().then(setLoaded, () => setLoaded({ data: null, error: "Unable to load summary." }));
  }, [initialResult, loadOnOpen]);

  // Also handle a native disclosure opened before hydration.
  useEffect(load, [load]);
  const { data, error } = result ?? {};
  return <details ref={details} className="panel complaint-summary" open={initiallyOpen} onToggle={load}>
    <summary><strong>Report Summary</strong><span className="complaint-summary-toggle">View date summary <span aria-hidden="true">⌄</span></span></summary>
    <div className="complaint-summary-content">
      {children}
      {!result && <p className="subtle" role="status">Loading report summary…</p>}
    {error ? <p className="error">Summary unavailable: {error}</p> : data && <>
      <div className="metrics compact">{[["New reports received", data.total], ["Rooms reported", data.rooms], ["Completed reports (current)", data.completed], ["Completed rooms (current)", data.completedRooms], ["In progress", data.inProgress], ["Pending material", data.pendingMaterial], ["Under monitoring", data.monitoring], ["Tenant not available", data.tenantUnavailable], ["Assigned / not started", data.assigned], ["Pending / not assigned", data.pending], ["KIV", data.kiv], ["Rejected", data.rejected]].map(([label, value]) => <article className="panel metric" key={String(label)}><span className="subtle">{label}</span><div className="value">{value}</div></article>)}</div>
      <p style={{ marginBottom: 0 }}><strong>Completion rate:</strong> {data.completionRate}% of reports received in this range are fully completed. <strong>Completed during this range:</strong> {data.completedJobs} jobs across {data.completedDuringPeriod} reports and {data.roomsCompletedDuringPeriod} rooms (including reports received earlier).</p>
    </>}
    </div>
  </details>;
}
