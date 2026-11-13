import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CheckoutBatchImport } from "@/components/checkout-batch-import";
import { CheckoutBulkAssign } from "@/components/checkout-bulk-assign";
import { CheckoutDefectPicker } from "@/components/checkout-defect-picker";
import { CheckoutProgressTable } from "@/components/checkout-progress-table";
import { CheckoutStatusDashboard, type CheckoutStatusReport } from "@/components/checkout-status-dashboard";
import { requireRole } from "@/lib/auth";
import { countOccupancyRooms, malaysiaDate } from "@/lib/checkout-occupancy-report";
import { parseCheckoutProgressFilters, type CheckoutProgressFilters } from "@/lib/checkout-progress";
import { checkoutProgressPageNumber, loadCheckoutOverviewRooms, loadCheckoutProgressPage } from "@/lib/checkout-progress.server";
import { createClient } from "@/lib/supabase/server";
import { createCheckout } from "./actions";

type Blocks = Promise<{ id: number; code: string }[]>;
type Workers = Promise<{ id: string; full_name: string; role: string }[]>;
type Overview = ReturnType<typeof loadCheckoutOverviewRooms>;

function loadStatusReport(db: Awaited<ReturnType<typeof createClient>>) {
  return Promise.resolve(db.rpc("checkout_status_report", { p_date: malaysiaDate(), p_group: "ALL" }));
}

type StatusReport = ReturnType<typeof loadStatusReport>;

async function CheckoutStatistics({ db, overview, report }: { db: Awaited<ReturnType<typeof createClient>>; overview: Overview; report: StatusReport }) {
  const [readyCount, { data, error }, sources] = await Promise.all([
    countOccupancyRooms(db).catch(() => null),
    report,
    overview,
  ]);
  if (error || sources.error || readyCount === null || !data) {
    return <p className="error">Unable to load dashboard statistics. Please refresh.</p>;
  }
  return <CheckoutStatusDashboard report={{ ...(data as CheckoutStatusReport), ready: readyCount }} sources={sources.rooms} />;
}

async function CheckoutAssignments({ overview, workers, canAssignCleaner }: { overview: Overview; workers: Workers; canAssignCleaner: boolean }) {
  const [sources, staff] = await Promise.all([overview, workers]);
  if (sources.error) return <p className="error">Unable to load rooms awaiting assignment. Please refresh.</p>;
  const rooms = sources.rooms.flatMap<{ id: string; label: string; kind: "maintenance" | "cleaner" }>(room => {
    const label = `Block ${room.block_code} · ${room.room_no}`;
    if (room.can_assign_maintenance) return [{ id: room.id, label, kind: "maintenance" }];
    if (room.can_assign_cleaner) return [{ id: room.id, label, kind: "cleaner" }];
    return [];
  });
  return <CheckoutBulkAssign rooms={rooms} workers={staff} canAssignCleaner={canAssignCleaner} />;
}

async function CheckoutCreate({ blocks, error }: { blocks: Blocks; error?: string }) {
  const availableBlocks = await blocks;
  return <>
    <CheckoutBatchImport blocks={availableBlocks} />
    <section className="panel checkout-create">
      <h3>Create check-out room record</h3>
      <form action={createCheckout} className="form-grid">
        <div className="field">
          <label htmlFor="checkout-create-block">Block</label>
          <select id="checkout-create-block" name="block" required>
            <option value="">Select block</option>
            {availableBlocks.map(block => <option key={block.id} value={block.id}>Block {block.code}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="checkout-create-room">Room</label>
          <input id="checkout-create-room" name="room" required placeholder="e.g. A-203" />
        </div>
        <div className="field field-wide">
          <label>UTMSPACE reported defects</label>
          <CheckoutDefectPicker name="checkoutDefects" required />
        </div>
        {error && <p className="error field-wide">{error}</p>}
        <button className="button">Create and inspect</button>
      </form>
    </section>
  </>;
}

async function CheckoutProgressSection({ progress, blocks, workers, filters, page, isAdmin, canAssignCleaner, report }: {
  progress: ReturnType<typeof loadCheckoutProgressPage>;
  report: StatusReport;
  blocks: Blocks;
  workers: Workers;
  filters: CheckoutProgressFilters;
  page: number;
  isAdmin: boolean;
  canAssignCleaner: boolean;
}) {
  const [result, availableBlocks, staff, { data }] = await Promise.all([progress, blocks, workers, report]);
  const pendingIds = new Set((data as CheckoutStatusReport | null)?.rooms
    .filter(room => room.maintenance_status === "Pending Material").map(room => room.id));
  return <CheckoutProgressTable
    rows={result.rows}
    pendingMaterialRoomIds={result.rows.filter(room => pendingIds.has(room.id)).map(room => room.id)}
    maintenanceWorkers={staff.filter(worker => worker.role === "maintenance_staff")}
    cleaners={staff.filter(worker => worker.role === "cleaner")}
    isAdmin={isAdmin}
    canAssignCleaner={canAssignCleaner}
    error={result.error?.message}
    pagination={result.paginated ? { filters, blocks: availableBlocks.map(block => block.code), page, hasNext: result.hasNext } : undefined}
  />;
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [profile, query] = await Promise.all([requireRole(["admin", "management_viewer"]), searchParams]);
  const db = await createClient();
  const isAdmin = profile.role === "admin";
  const isCleanerCoordinator = ["mary", "fikri"].includes(profile.username);
  const filters = parseCheckoutProgressFilters(query);
  const page = checkoutProgressPageNumber(query.page);
  const progress = loadCheckoutProgressPage(db, filters, page);
  const overview = loadCheckoutOverviewRooms(db);
  const report = loadStatusReport(db);
  const blocks: Blocks = Promise.resolve(db.from("blocks").select("id,code").order("code")).then(({ data }) => data || []);
  const workers: Workers = isAdmin
    ? Promise.resolve(db.from("profiles").select("id,full_name,role").eq("is_active", true).is("deleted_at", null)
      .in("role", ["maintenance_staff", "cleaner"]).order("full_name")).then(({ data }) => data || [])
    : Promise.resolve([]);

  return <AppShell profile={profile} title="Check-out Rooms">
    <div className="checkout-overview">
      <div className="checkout-overview-header">
        <h2>Check-out room readiness</h2>
        <div className="checkout-overview-actions">
          {isAdmin && <Link className="button" href="/admin/checkouts/inspection">Room Inspection · Block A &amp; B</Link>}
          <Link className="button secondary" href="/admin/checkouts/painting"><span aria-hidden="true">🎨</span> General Worker · Room / Bathroom List</Link>
          <Link className="button secondary" href="/admin/checkouts/occupancy-report">Ready for Occupancy Report</Link>
        </div>
      </div>
      <Suspense fallback={<p className="subtle" role="status">Loading check-out statistics…</p>}>
        <CheckoutStatistics db={db} overview={overview} report={report} />
      </Suspense>
      {isAdmin && <>
        <Suspense fallback={<p className="subtle" role="status">Loading rooms awaiting assignment…</p>}>
          <CheckoutAssignments overview={overview} workers={workers} canAssignCleaner={isCleanerCoordinator} />
        </Suspense>
        <Suspense>
          <CheckoutCreate blocks={blocks} error={typeof query.error === "string" ? query.error : undefined} />
        </Suspense>
      </>}
      <Suspense fallback={<p className="subtle" role="status">Loading check-out rooms…</p>}>
        <CheckoutProgressSection
          progress={progress}
          report={report}
          blocks={blocks}
          workers={workers}
          filters={filters}
          page={page}
          isAdmin={isAdmin}
          canAssignCleaner={isAdmin && (isCleanerCoordinator || Boolean(profile.is_super_admin))}
        />
      </Suspense>
    </div>
  </AppShell>;
}
