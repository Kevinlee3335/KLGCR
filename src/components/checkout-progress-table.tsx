"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Search, X } from "lucide-react";
import { bulkAssignCheckouts } from "@/app/(dashboard)/admin/checkouts/actions";
import { assignPainting } from "@/app/(dashboard)/admin/checkouts/painting/actions";
import { checkoutProgress, checkoutStatusLabel, isRepairDefect } from "@/lib/checkouts";
import { checkoutProgressHref, checkoutProgressStatuses, type CheckoutProgressFilters, type CheckoutProgressPagination, type CheckoutProgressRow, type LegacyCheckoutProgressRow } from "@/lib/checkout-progress";
import { isPaintingDefect } from "@/lib/painting-eligibility";
import styles from "./checkout-progress-controls.module.css";
import followUp from "./monitoring-follow-up.module.css";

type Row = CheckoutProgressRow | LegacyCheckoutProgressRow;
type Worker = { id: string; full_name: string };

const fallbackBlocks = ["all", "A", "B"];
const defaultFilters = { block: "all", status: "", room: "" };
const paintingStatus = checkoutProgressStatuses.painting_only.label;
const statusOptions = Object.entries(checkoutProgressStatuses).map(([value, { label }]) => ({ value, label }));
const statusOrder = statusOptions.map(({ label }) => label);
const compareText = new Intl.Collator("en-MY", { numeric: true, sensitivity: "base" }).compare;
const createdDateFormat = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur" });
const workDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function normalizeRoom(value: string) {
  return value.toUpperCase().replace(/[\s-]+/g, "");
}

function prepareRoom(row: Row) {
  if ("progress_status" in row) {
    const completed = row.defect_count - row.remaining_count;
    return {
      row: {
        ...row,
        block: { code: row.block_code },
        assignee: row.maintenance_name ? { full_name: row.maintenance_name } : null,
        cleaner: row.cleaner_name ? { full_name: row.cleaner_name } : null,
      },
      progress: { total: row.defect_count, completed, percent: row.defect_count ? Math.round(completed * 100 / row.defect_count) : 100 },
      canAssignCleaner: row.can_assign_cleaner,
      canAssignMaintenance: row.can_assign_maintenance,
      canAssignPainting: row.can_assign_painting,
      blockCode: row.block_code,
      roomNumber: "",
      fullRoom: "",
      display: checkoutProgressStatuses[row.progress_status],
      rank: 0,
      painting: paintingBadge(row.painting_status),
      createdDate: createdDateFormat.format(new Date(row.created_at)),
    };
  }

  const progress = checkoutProgress(row.defects);
  const canAssignCleaner =
    !row.cleaner_id &&
    ((row.status === "verification" && progress.remaining === 0) ||
      (row.status === "second_inspection" &&
        progress.total === 0 &&
        !isRepairDefect({ description: row.utmspace_defects })));
  const canAssignMaintenance = row.status === "second_inspection" && !row.assigned_to && progress.total > 0;
  const openDefects = canAssignMaintenance
    ? row.defects.filter((defect) => defect.status !== "rectified" && isRepairDefect(defect))
    : [];
  const paintingOnly = openDefects.length > 0 && openDefects.every(isPaintingDefect);
  const canAssignPainting =
    paintingOnly && !row.painting?.some((task) => task.status === "assigned" || task.status === "in_progress");
  const blockCode = (row.block?.code ?? "").trim().toUpperCase();
  const roomNumber = normalizeRoom(row.room_no);
  const fullRoom = roomNumber.startsWith(blockCode) ? roomNumber : `${blockCode}${roomNumber}`;
  const display = displayStatus(row, canAssignCleaner, progress.total, paintingOnly);
  const rank = statusOrder.findIndex(label => label === display.label);
  const painting = paintingBadge(row.painting?.some((task) => task.status === "in_progress")
    ? "in_progress"
    : row.painting?.some((task) => task.status === "assigned")
      ? "assigned"
      : row.painting?.some((task) => task.status !== "cancelled") ? "completed" : null);

  return {
    row,
    progress,
    canAssignCleaner,
    canAssignMaintenance,
    canAssignPainting,
    blockCode,
    roomNumber,
    fullRoom,
    display,
    rank: rank < 0 ? statusOrder.length : rank,
    painting,
    createdDate: createdDateFormat.format(new Date(row.created_at)),
  };
}

function paintingBadge(status: CheckoutProgressRow["painting_status"]) {
  if (status === "in_progress") return { label: "In Progress", tone: "painting" };
  if (status === "assigned") return { label: "Assigned", tone: "repairComplete" };
  return status === "completed" ? { label: "Completed", tone: "ready" } : null;
}

function displayStatus(row: LegacyCheckoutProgressRow, canAssignCleaner: boolean, defectCount: number, paintingOnly: boolean) {
  if (row.status === "ready_for_occupancy") return { label: "Ready for Occupancy", tone: "ready" };
  if (row.status === "cleaning") return { label: "Cleaning", tone: "painting" };
  if (canAssignCleaner && defectCount === 0) return { label: "No Defect · Assign Cleaner", tone: "noDefect" };
  if (canAssignCleaner) return { label: "Repair Completed · Assign Cleaner", tone: "repairComplete" };
  if (row.status === "rectification") return { label: "Rectification in Progress", tone: "repairing" };
  if (paintingOnly) return { label: paintingStatus, tone: "painting" };
  if (row.status === "second_inspection" && defectCount > 0) return { label: "Awaiting Maintenance", tone: "awaiting" };
  return { label: checkoutStatusLabel[row.status], tone: "neutral" };
}

function selectVisible(previous: string[], available: string[], checked: boolean) {
  const visible = new Set(available);
  return checked ? [...new Set([...previous, ...available])] : previous.filter(id => !visible.has(id));
}

function AssignPaintingButton({ count, loading }: { count: number; loading: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className={`${followUp.action} ${styles.assignButton}`} disabled={loading || pending || !count || count > 100}>
      {pending ? "Assigning…" : `Assign ${count} room(s)`}
    </button>
  );
}

export function CheckoutProgressTable({
  rows,
  cleaners,
  maintenanceWorkers = [],
  isAdmin,
  canAssignCleaner,
  error,
  pagination,
}: {
  rows: Row[];
  cleaners: Worker[];
  maintenanceWorkers?: Worker[];
  isAdmin: boolean;
  canAssignCleaner: boolean;
  error?: string;
  pagination?: CheckoutProgressPagination;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [cleaner, setCleaner] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const appliedFilters = pagination?.filters ?? defaultFilters;
  const [filterInput, setFilterInput] = useState({ applied: appliedFilters, draft: appliedFilters });
  const { block: blockFilter, status: statusFilter, room: roomQuery } = filterInput.draft;
  const [maintenanceSelected, setMaintenanceSelected] = useState<string[]>([]);
  const [maintenanceWorker, setMaintenanceWorker] = useState("");
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [paintingSelected, setPaintingSelected] = useState<string[]>([]);
  if (filterInput.applied.block !== appliedFilters.block || filterInput.applied.status !== appliedFilters.status || filterInput.applied.room !== appliedFilters.room) {
    setFilterInput({
      applied: appliedFilters,
      draft: {
        block: blockFilter === filterInput.applied.block ? appliedFilters.block : blockFilter,
        status: statusFilter === filterInput.applied.status ? appliedFilters.status : statusFilter,
        room: roomQuery === filterInput.applied.room ? appliedFilters.room : roomQuery,
      },
    });
    clearSelections();
  }
  const paintingMode = isAdmin && statusFilter === (pagination ? "painting_only" : paintingStatus);
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  const loading = navigating || Boolean(pagination && (
    blockFilter !== appliedFilters.block || statusFilter !== appliedFilters.status || roomQuery !== appliedFilters.room
  ));
  const isPaginated = Boolean(pagination);

  const { sortedRooms, filterStatuses } = useMemo(() => {
    const prepared = rows.map(prepareRoom);
    if (isPaginated) return { sortedRooms: prepared, filterStatuses: statusOptions };
    const sortedRooms = prepared.sort((a, b) => (
      a.rank - b.rank ||
      compareText(a.display.label, b.display.label) ||
      compareText(a.row.block?.code ?? "", b.row.block?.code ?? "") ||
      compareText(a.row.room_no, b.row.room_no) ||
      compareText(a.row.reference_no, b.row.reference_no)
    ));

    return { sortedRooms, filterStatuses: [...new Set(sortedRooms.map(({ display }) => display.label))].map(label => ({ value: label, label })) };
  }, [isPaginated, rows]);

  const normalizedRoomQuery = normalizeRoom(roomQuery);
  const { visibleRooms, eligible, maintenanceAvailable, paintingAvailable } = useMemo(() => {
    const blockInQuery = /^[A-D]/.test(normalizedRoomQuery);
    const visibleRooms = isPaginated ? sortedRooms : sortedRooms.filter(({ blockCode, display, fullRoom, roomNumber }) => (
      (blockFilter === "all" || blockCode === blockFilter) &&
      (!statusFilter || display.label === statusFilter) &&
      (!normalizedRoomQuery || fullRoom.includes(normalizedRoomQuery) ||
        (!blockInQuery && roomNumber.includes(normalizedRoomQuery)))
    ));

    return {
      visibleRooms,
      eligible: visibleRooms.filter((room) => room.canAssignCleaner).map(({ row }) => row.id),
      maintenanceAvailable: visibleRooms.filter((room) => room.canAssignMaintenance).map(({ row }) => row.id),
      paintingAvailable: visibleRooms.filter((room) => room.canAssignPainting).map(({ row }) => row.id),
    };
  }, [blockFilter, isPaginated, normalizedRoomQuery, sortedRooms, statusFilter]);
  const selectedIds = new Set(selected);
  const maintenanceSelectedIds = new Set(maintenanceSelected);
  const paintingSelectedIds = new Set(paintingSelected);

  function clearSelections() {
    setSelected([]);
    setPaintingSelected([]);
    setMaintenanceSelected([]);
  }

  function navigate(filters: CheckoutProgressFilters, page?: number) {
    clearTimeout(searchTimer.current);
    if (!pagination) return;
    const href = checkoutProgressHref(filters, page);
    startNavigation(() => {
      if (page === undefined) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });
  }

  function updateFilters(update: Partial<CheckoutProgressFilters>, delay = 0) {
    const draft = { ...filterInput.draft, ...update };
    setFilterInput({ applied: appliedFilters, draft });
    clearSelections();
    clearTimeout(searchTimer.current);
    if (!pagination) return;
    if (delay) searchTimer.current = setTimeout(() => navigate(draft), delay);
    else navigate(draft);
  }

  async function assignMaintenance() {
    setMaintenanceBusy(true);
    setMaintenanceMessage("");
    try {
      const result = await bulkAssignCheckouts(maintenanceSelected, maintenanceWorker, "maintenance");
      if ("error" in result) {
        setMaintenanceMessage(result.error || "Unable to assign rooms.");
      } else {
        setMaintenanceMessage(`${result.count} room(s) assigned to maintenance.`);
        setMaintenanceSelected([]);
        router.refresh();
      }
    } catch {
      setMaintenanceMessage("Unable to assign rooms. Please try again.");
    } finally {
      setMaintenanceBusy(false);
    }
  }

  async function assign() {
    setBusy(true);
    setMessage("");
    try {
      const result = await bulkAssignCheckouts(selected, cleaner, "cleaner");
      if ("error" in result) {
        setMessage(result.error || "Unable to assign rooms.");
      } else {
        setMessage(`${result.count} room(s) assigned successfully.`);
        setSelected([]);
        router.refresh();
      }
    } catch {
      setMessage("Unable to assign rooms. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={followUp.panel} aria-labelledby="checkout-progress-title">
      <header className={followUp.header}>
        <div className={`${followUp.heading} ${styles.heading}`}>
          <span className={followUp.icon}><ClipboardList size={20} aria-hidden="true" /></span>
          <div>
            <span className={followUp.eyebrow}>CHECK-OUT ROOMS</span>
            <h2 id="checkout-progress-title">Check-out Progress Table</h2>
            {(isAdmin || canAssignCleaner) && (
              <p>Select rooms awaiting maintenance or ready for cleaning and assign them together.</p>
            )}
          </div>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <div className={styles.blocks} role="group" aria-label="Filter by block">
            {(pagination?.blocks.length ? ["all", ...pagination.blocks] : fallbackBlocks).map((block) => (
              <button
                key={block}
                type="button"
                aria-pressed={blockFilter === block}
                onClick={() => updateFilters({ block })}
              >
                {block === "all" ? "All Blocks" : `Block ${block}`}
              </button>
            ))}
          </div>
          <label className={styles.field} htmlFor="checkout-status-filter">
            Filter by status
            <select
              id="checkout-status-filter"
              value={statusFilter}
              onChange={(event) => updateFilters({ status: event.target.value })}
            >
              <option value="">All statuses</option>
              {filterStatuses.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className={`${styles.field} ${styles.searchField}`}>
            <label htmlFor="checkout-room-search">Search room</label>
            <div className={styles.searchInputWrap}>
              <Search size={17} aria-hidden="true" />
              <input
                id="checkout-room-search"
                type="search"
                placeholder="e.g. B601"
                autoComplete="off"
                maxLength={80}
                value={roomQuery}
                onChange={(event) => updateFilters({ room: event.target.value }, 250)}
              />
              {roomQuery && (
                <button
                  type="button"
                  className={styles.clearSearch}
                  aria-label="Clear room search"
                  onClick={() => updateFilters({ room: "" })}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>

        {(isAdmin || canAssignCleaner) && (
          <div className={styles.assignments}>
            {isAdmin && (
              <div className={styles.assignment}>
                <label className={styles.field} htmlFor="table-maintenance">
                  Maintenance
                  <select
                    id="table-maintenance"
                    value={maintenanceWorker}
                    onChange={(event) => setMaintenanceWorker(event.target.value)}
                    disabled={maintenanceBusy}
                  >
                    <option value="">Select maintenance</option>
                    {maintenanceWorkers.map((worker) => <option key={worker.id} value={worker.id}>{worker.full_name}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  className={`${followUp.action} ${styles.assignButton}`}
                  disabled={loading || maintenanceBusy || !maintenanceWorker || !maintenanceSelected.length || maintenanceSelected.length > 100}
                  onClick={assignMaintenance}
                >
                  {maintenanceBusy ? "Assigning…" : `Assign ${maintenanceSelected.length} room(s) to maintenance`}
                </button>
                {maintenanceMessage && <p role="status">{maintenanceMessage}</p>}
              </div>
            )}
            {canAssignCleaner && (
              <div className={styles.assignment}>
                <label className={styles.field} htmlFor="table-cleaner">
                  Cleaner / Housekeeping
                  <select id="table-cleaner" value={cleaner} onChange={(event) => setCleaner(event.target.value)} disabled={busy}>
                    <option value="">Select cleaner</option>
                    {cleaners.map((worker) => <option key={worker.id} value={worker.id}>{worker.full_name}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  className={`${followUp.action} ${styles.assignButton}`}
                  disabled={loading || busy || !cleaner || !selected.length || selected.length > 100}
                  onClick={assign}
                >
                  {busy ? "Assigning…" : `Assign ${selected.length} room(s) to cleaner`}
                </button>
                {message && <p role="status">{message}</p>}
              </div>
            )}
            {paintingMode && (
              <form className={styles.assignment} action={assignPainting}>
                <label className={styles.field} htmlFor="painting-worker">
                  General worker
                  <input id="painting-worker" name="worker" required maxLength={100} placeholder="General worker name" />
                </label>
                <label className={styles.field} htmlFor="painting-date">
                  Work date
                  <input id="painting-date" name="date" type="date" defaultValue={workDateFormat.format(new Date())} required />
                </label>
                <input type="hidden" name="reasons" value="Other" />
                <input type="hidden" name="notes" value="Painting work identified from room defects." />
                <AssignPaintingButton count={paintingSelected.length} loading={loading} />
                {paintingSelected.map((id) => <input key={id} type="hidden" name="rooms" value={id} />)}
              </form>
            )}
          </div>
        )}
      </div>

      {loading && <p className={followUp.empty} role="status">Loading check-out rooms…</p>}
      {error && <p className={followUp.empty} role="alert">{error}</p>}
      {visibleRooms.length > 0 ? (
        <div className={`${followUp.scroll} ${styles.scroll}`} role="region" aria-labelledby="checkout-progress-title" aria-busy={loading} tabIndex={0}>
          <table className={`${followUp.table} ${styles.table}`} aria-labelledby="checkout-progress-title">
            <thead>
              <tr>
                {isAdmin && (
                  <th scope="col" className={styles.selection}>
                    <label>
                      <span>Maint.</span>
                      <input
                        type="checkbox"
                        aria-label="Select all available maintenance rooms"
                        checked={maintenanceAvailable.length > 0 && maintenanceAvailable.every((id) => maintenanceSelectedIds.has(id))}
                        disabled={loading || maintenanceBusy || !maintenanceAvailable.length}
                        onChange={(event) => setMaintenanceSelected(previous => selectVisible(previous, maintenanceAvailable, event.target.checked))}
                      />
                    </label>
                  </th>
                )}
                {paintingMode && (
                  <th scope="col" className={styles.selection}>
                    <label>
                      <span>Paint</span>
                      <input
                        type="checkbox"
                        aria-label="Select all available painting rooms"
                        checked={paintingAvailable.length > 0 && paintingAvailable.every((id) => paintingSelectedIds.has(id))}
                        disabled={loading || !paintingAvailable.length}
                        onChange={(event) => setPaintingSelected(previous => selectVisible(previous, paintingAvailable, event.target.checked))}
                      />
                    </label>
                  </th>
                )}
                {canAssignCleaner && (
                  <th scope="col" className={styles.selection}>
                    <label>
                      <span>Clean</span>
                      <input
                        type="checkbox"
                        aria-label="Select all eligible rooms"
                        checked={eligible.length > 0 && eligible.every((id) => selectedIds.has(id))}
                        disabled={loading || busy || !eligible.length}
                        onChange={(event) => setSelected(previous => selectVisible(previous, eligible, event.target.checked))}
                      />
                    </label>
                  </th>
                )}
                <th scope="col">Room / Reference</th>
                <th scope="col">Status</th>
                <th scope="col">Repair progress</th>
                <th scope="col">Maintenance</th>
                <th scope="col">Housekeeping</th>
                <th scope="col">Painting</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {visibleRooms.map(({
                row, progress, canAssignCleaner: cleanerEligible, canAssignMaintenance, canAssignPainting, display, painting, createdDate,
              }) => (
                <tr key={row.id}>
                  {isAdmin && (
                    <td className={styles.selection}>
                      <input
                        type="checkbox"
                        aria-label={`Select maintenance room ${row.room_no}`}
                        disabled={loading || maintenanceBusy || !canAssignMaintenance}
                        checked={maintenanceSelectedIds.has(row.id)}
                        onChange={(event) => setMaintenanceSelected(event.target.checked
                          ? [...maintenanceSelected, row.id]
                          : maintenanceSelected.filter((id) => id !== row.id))}
                      />
                    </td>
                  )}
                  {paintingMode && (
                    <td className={styles.selection}>
                      <input
                        type="checkbox"
                        aria-label={`Select painting room ${row.room_no}`}
                        disabled={loading || !canAssignPainting}
                        checked={paintingSelectedIds.has(row.id)}
                        onChange={(event) => setPaintingSelected(event.target.checked
                          ? [...paintingSelected, row.id]
                          : paintingSelected.filter((id) => id !== row.id))}
                      />
                    </td>
                  )}
                  {canAssignCleaner && (
                    <td className={styles.selection}>
                      <input
                        type="checkbox"
                        aria-label={`Select room ${row.room_no}`}
                        disabled={loading || busy || !cleanerEligible}
                        checked={selectedIds.has(row.id)}
                        onChange={(event) => setSelected(event.target.checked
                          ? [...selected, row.id]
                          : selected.filter((id) => id !== row.id))}
                      />
                    </td>
                  )}
                  <td>
                    <span className={`${followUp.block} ${styles.block}`}>BLOCK {row.block?.code || "—"}</span>
                    <strong className={followUp.room}>{row.room_no}</strong>
                    <Link className={`${styles.textLink} ${styles.reference}`} href={`/admin/checkouts/${row.id}`}>{row.reference_no}</Link>
                  </td>
                  <td>
                    <span className={`${followUp.status} ${styles.badge} ${styles[display.tone]}`}><i aria-hidden="true" />{display.label}</span>
                  </td>
                  <td>
                    <div className={styles.progressValue}>
                      <progress max="100" value={progress.percent} aria-label={`Room ${row.room_no} repair completion`} />
                      <strong>{progress.percent}%</strong>
                    </div>
                    <small>{progress.completed}/{progress.total} defects</small>
                  </td>
                  <td>
                    {row.assignee?.full_name || "—"}
                    {isAdmin && row.status === "rectification" && (
                      <Link className={styles.textLink} href={`/admin/checkouts/${row.id}#transfer-task`}>Transfer task →</Link>
                    )}
                  </td>
                  <td>
                    {row.cleaner?.full_name || "—"}
                    {isAdmin && row.status === "cleaning" && row.cleaner_id && (
                      <Link className={styles.textLink} href={`/admin/checkouts/${row.id}#transfer-cleaner-task`}>Transfer task →</Link>
                    )}
                  </td>
                  <td>
                    {painting ? (
                      <Link className={`${followUp.status} ${styles.badge} ${styles[painting.tone]} ${styles.paintingLink}`} href="/admin/checkouts/painting">
                        <i aria-hidden="true" />{painting.label}
                      </Link>
                    ) : "—"}
                  </td>
                  <td><time dateTime={row.created_at}>{createdDate}</time></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !error && !loading && (
        <div className={followUp.empty}>{rows.length || blockFilter !== "all" || statusFilter || normalizedRoomQuery
          ? "No rooms match your search or filters"
          : pagination && pagination.page > 1 ? "No rooms on this page" : "No check-out rooms yet"}</div>
      )}
      {pagination && !error && (pagination.page > 1 || pagination.hasNext) && (
        <nav className={`pagination ${styles.pagination}`} aria-label="Check-out room pages">
          {pagination.page > 1 && <button type="button" className="button secondary" disabled={loading} onClick={() => navigate(pagination.filters, pagination.page - 1)}>Previous</button>}
          <span>Page {pagination.page}</span>
          {pagination.hasNext && <button type="button" className="button secondary" disabled={loading} onClick={() => navigate(pagination.filters, pagination.page + 1)}>Next</button>}
        </nav>
      )}
    </section>
  );
}
