import { compareUnifiInvoicePeriodAndLine, formatUnifiBillingMonth, formatUnifiDate, formatUnifiLine } from "@/app/(dashboard)/admin/unifi-invoices/display";
import { listUnifiInvoices, unifiInvoicePath, unifiPendingStages, unifiReviewerForStage } from "@/lib/unifi-invoices";
import { DashboardActionFollowUp } from "./dashboard-action-follow-up";

export async function UnifiReviewFollowUp({ userId }: { userId: string }) {
  const stage = unifiPendingStages.find(item => unifiReviewerForStage[item].id === userId);
  if (!stage) return null;

  const invoices = await listUnifiInvoices(stage).catch(() => []);
  if (!invoices.length) return null;

  return (
    <DashboardActionFollowUp
      title={stage === "james" ? "TM Unifi Invoice Approval" : "TM Unifi Invoice Verification"}
      subtitle="TM Unifi bills awaiting your review."
      count={invoices.length}
      items={invoices.slice().sort(compareUnifiInvoicePeriodAndLine).slice(0, 12).map(invoice => ({
        id: invoice.id,
        name: `${formatUnifiBillingMonth(invoice.period)} · ${formatUnifiLine(invoice.line_number)}`,
        detail: [
          invoice.account_number && `Account No. ${invoice.account_number}`,
          invoice.invoice_number || invoice.file_name,
        ].filter(Boolean).join(" · "),
        meta: invoice.due_date ? formatUnifiDate(invoice.due_date) : "—",
        href: `${unifiInvoicePath}/${invoice.id}`,
      }))}
      href={unifiInvoicePath}
      action="Review invoice"
      nameColumn="Billing month / line"
      detailColumn="Account / invoice"
      metaColumn="Due date"
    />
  );
}
