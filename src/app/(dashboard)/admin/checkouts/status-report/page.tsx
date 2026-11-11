import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CheckoutStatusDashboard, type CheckoutStatusReport } from "@/components/checkout-status-dashboard";
import { PrintReportButton } from "@/components/print-report-button";
import { requireRole } from "@/lib/auth";
import { countOccupancyRooms, malaysiaDate } from "@/lib/checkout-occupancy-report";
import { loadCheckoutOverviewRooms } from "@/lib/checkout-progress.server";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const profile = await requireRole(["admin", "management_viewer"]);
  const db = await createClient();
  const [readyCount, { data, error }, sources] = await Promise.all([
    countOccupancyRooms(db).catch(() => null),
    db.rpc("checkout_status_report", { p_date: malaysiaDate(), p_group: "ALL" }),
    loadCheckoutOverviewRooms(db),
  ]);
  return <AppShell profile={profile} title="Check-out Status Report">
    <div className="section-head no-print">
      <Link className="button secondary" href="/admin/checkouts">Back to Check-out Rooms</Link>
      <PrintReportButton />
    </div>
    {error || sources.error || readyCount === null || !data
      ? <p className="error">Unable to load the status report. Please refresh.</p>
      : <CheckoutStatusDashboard report={{ ...(data as CheckoutStatusReport), ready: readyCount }} sources={sources.rooms} details />}
  </AppShell>;
}
