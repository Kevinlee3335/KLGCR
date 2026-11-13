import { formatUnifiBillingMonth, formatUnifiDate, formatUnifiLine } from "@/app/(dashboard)/admin/unifi-invoices/display";
import { getUnifiInvoiceFollowUp } from "@/lib/unifi-invoice-follow-up";
import { unifiInvoicePath } from "@/lib/unifi-invoices";
import { DashboardActionFollowUp } from "./dashboard-action-follow-up";

const syncDetail = {
  unconfirmed: "A successful Webmail sync has not been confirmed. Ask the Super Admin to check the connection and sync.",
  failed: "The latest Webmail sync needs attention. Ask the Super Admin to check the sync result.",
  stale: "The latest successful Webmail sync is out of date. Ask the Super Admin to run Sync now.",
  unavailable: "Invoice or Webmail status could not be loaded. Check TM Unifi Invoices for details.",
};

export async function UnifiInvoiceFollowUp() {
  const { health, missing } = await getUnifiInvoiceFollowUp().catch(() => ({ health: "unavailable" as const, missing: [] }));
  if (health !== "ready") {
    return <DashboardActionFollowUp
      title="TM Unifi Webmail check needed"
      subtitle="A fresh successful check is needed to confirm which bills are missing."
      count={1}
      items={[{ id: "webmail", name: "Webmail sync", detail: syncDetail[health] }]}
      href={unifiInvoicePath}
      action="Open TM Unifi Invoices"
      nameColumn="Connection"
      detailColumn="Follow-up"
    />;
  }

  if (!missing.length) return null;

  return <DashboardActionFollowUp
    title="TM Unifi invoices not received"
    subtitle="Check with Unifi for bills that have passed their expected arrival date."
    count={missing.length}
    items={missing.map(({ period, lineNumber, followUpOn }) => ({
      id: `${period}-${lineNumber}`,
      name: `${formatUnifiBillingMonth(period)} · ${formatUnifiLine(lineNumber)}`,
      detail: "Invoice not received",
      meta: formatUnifiDate(followUpOn),
    }))}
    href={unifiInvoicePath}
    action="Open TM Unifi Invoices"
    nameColumn="Billing month / line"
    detailColumn="Follow-up"
    metaColumn="Follow up from"
  />;
}
