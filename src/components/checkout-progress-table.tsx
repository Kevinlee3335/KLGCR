"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Search, X } from "lucide-react";
import { bulkAssignCheckouts } from "@/app/(dashboard)/admin/checkouts/actions";
import { assignPainting } from "@/app/(dashboard)/admin/checkouts/painting/actions";
import { checkoutProgress, checkoutStatusLabel, isRepairDefect, type CheckoutRoom } from "@/lib/checkouts";
import { isPaintingDefect } from "@/lib/painting-eligibility";
import styles from "./checkout-progress-controls.module.css";
import followUp from "./monitoring-follow-up.module.css";

type Row = CheckoutRoom & {
  defects: { description: string; status: string }[];
  painting: { status: string }[];
};

type Worker = { id: string; full_name: string };
type BlockFilter = "all" | "A" | "B";

const blocks: BlockFilter[] = ["all", "A", "B"];
const paintingStatus = "Awaiting Maintenance · Painting Work Only";
const statusOrder = [
  paintingStatus,
  "Awaiting Maintenance",
  "Rectification in Progress",
  "No Defect · Assign Cleaner",
  "Repair Completed · Assign Cleaner",
  "Cleaning",
  "Admin verification",
];
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
  const rank = statusOrder.indexOf(display.label);
  const painting = row.painting?.some((task) => task.status === "in_progress")
    ? { label: "In Progress", tone: "painting" }
    : row.painting?.some((task) => task.status === "assigned")
      ? { label: "Assigned", tone: "repairComplete" }
      : row.painting?.some((task) => task.status !== "cancelled")
        ? { label: "Completed", tone: "ready" }
        : null;

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
    rank: row.status === "ready_for_occupancy" ? statusOrder.length + 1 : rank < 0 ? statusOrder.length : rank,
    painting,
    createdDate: createdDateFormat.format(new Date(row.created_at)),
  };
}

function displayStatus(row: Row, canAssignCleaner: boolean, defectCount: number, paintingOnly: boolean) {
  if (row.status === "ready_for_occupancy") return { label: "Ready for Occupancy", tone: "ready" };
  if (row.status === "cleaning") return { label: "Cleaning", tone: "painting" };
  if (canAssignCleaner && defectCount === 0) return { label: "No Defect · Assign Cleaner", tone: "noDefect" };
  if (canAssignCleaner) return { label: "Repair Completed · Assign Cleaner", tone: "repairComplete" };
  if (row.status === "rectification") return { label: "Rectification in Progress", tone: "repairing" };
  if (paintingOnly) return { label: paintingStatus, tone: "painting" };
  if (row.status === "second_inspection" && defectCount > 0) return { label: "Awaiting Maintenance", tone: "awaiting" };
  return { label: checkoutStatusLabel[row.status], tone: "neutral" };
}

function AssignPaintingButton({ count }: { count: number }) {
  const { pending } = useFormStatus();

  return (
    <button className={`${followUp.action} ${styles.assignButton}`} disabled={pending || !count || count > 100}>
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
}: {
  rows: Row[];
  cleaners: Worker[];
  maintenanceWorkers?: Worker[];
  isAdmin: boolean;
  canAssignCleaner: boolean;
  error?: string;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [cleaner, setCleaner] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [blockFilter, setBlockFilter] = useState<BlockFilter>("all");
  const [roomQuery, setRoomQuery] = useState("");
  const [maintenanceSelected, setMaintenanceSelected] = useState<string[]>([]);
  const [maintenanceWorker, setMaintenanceWorker] = useState("");
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [paintingSelected, setPaintingSelected] = useState<string[]>([]);
  const paintingMode = isAdmin && statusFilter === paintingStatus;
  const router = useRouter();

  const { sortedRooms, statusOptions } = useMemo(() => {
    const sortedRooms = rows.map(prepareRoom).sort((a, b) => (
      a.rank - b.rank ||
      compareText(a.display.label, b.display.label) ||
      compareText(a.row.block?.code ?? "", b.row.block?.code ?? "") ||
      compareText(a.row.room_no, b.row.room_no) ||
      compareText(a.row.reference_no, b.row.reference_no)
    ));

    return { sortedRooms, statusOptions: [...new Set(sortedRooms.map(({ display }) => display.label))] };
  }, [rows]);

  const normalizedRoomQuery = normalizeRoom(roomQuery);
  const { visibleRooms, eligible, maintenanceAvailable, paintingAvailable } = useMemo(() => {
    const blockInQuery = /^[A-D]/.test(normalizedRoomQuery);
    const visibleRooms = sortedRooms.filter(({ blockCode, display, fullRoom, roomNumber }) => (
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
  }, [blockFilter, normalizedRoomQuery, sortedRooms, statusFilter]);
  const selectedIds = new Set(selected);
  const maintenanceSelectedIds = new Set(maintenanceSelected);
  const paintingSelectedIds = new Set(paintingSelected);

  function clearSelections() {
    setSelected([]);
    setPaintingSelected([]);
    setMaintenanceSelected([]);
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
            {blocks.map((block) => (
              <button
                key={block}
                type="button"
                aria-pressed={blockFilter === block}
                onClick={() => {
                  setBlockFilter(block);
                  clearSelections();
                }}
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
              onChange={(event) => {
                setStatusFilter(event.target.value);
                clearSelections();
              }}
            >
              <option value="">All statuses</option>
              {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
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
                value={roomQuery}
                onChange={(event) => {
                  setRoomQuery(event.target.value);
                  clearSelections();
                }}
              />
              {roomQuery && (
                <button
                  type="button"
                  className={styles.clearSearch}
                  aria-label="Clear room search"
                  onClick={() => {
                    setRoomQuery("");
                    clearSelections();
                  }}
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
                  disabled={maintenanceBusy || !maintenanceWorker || !maintenanceSelected.length || maintenanceSelected.length > 100}
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
                  disabled={busy || !cleaner || !selected.length || selected.length > 100}
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
                <AssignPaintingButton count={paintingSelected.length} />
                {paintingSelected.map((id) => <input key={id} type="hidden" name="rooms" value={id} />)}
              </form>
            )}
          </div>
        )}
      </div>

      {error && <p className={followUp.empty} role="alert">{error}</p>}
      {visibleRooms.length > 0 ? (
        <div className={`${followUp.scroll} ${styles.scroll}`} role="region" aria-labelledby="checkout-progress-title" tabIndex={0}>
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
                        disabled={maintenanceBusy || !maintenanceAvailable.length}
                        onChange={(event) => setMaintenanceSelected(event.target.checked ? maintenanceAvailable : [])}
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
                        disabled={!paintingAvailable.length}
                        onChange={(event) => setPaintingSelected(event.target.checked ? paintingAvailable : [])}
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
                        disabled={busy || !eligible.length}
                        onChange={(event) => setSelected(event.target.checked ? eligible : [])}
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
                        disabled={maintenanceBusy || !canAssignMaintenance}
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
                        disabled={!canAssignPainting}
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
                        disabled={busy || !cleanerEligible}
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
      ) : !error && (
        <div className={followUp.empty}>{rows.length ? "No rooms match your search or filters" : "No check-out rooms yet"}</div>
      )}
    </section>
  );
}
