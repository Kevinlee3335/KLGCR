import type { Profile } from "@/lib/types";
import type { UnifiInvoiceDelivery } from "@/lib/unifi-invoice-mail";
import { unifiReviewerForStage, type UnifiInvoiceStage } from "@/lib/unifi-invoices";

const billingMonthFormat = new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric", timeZone: "UTC" });
const malaysiaDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Kuala_Lumpur",
});
const malaysiaDateTime = new Intl.DateTimeFormat("en-MY", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kuala_Lumpur",
});

export function formatUnifiBillingMonth(period: string) {
  return billingMonthFormat.format(new Date(`${period}-01T00:00:00Z`));
}

export function formatUnifiLine(line: number | null) {
  return line == null ? "Unassigned" : `Line ${line}`;
}

export function formatUnifiDate(value: string) {
  return malaysiaDate.format(new Date(value));
}

export function formatUnifiDateTime(value: string) {
  return `${malaysiaDateTime.format(new Date(value))} MYT`;
}

export function compareUnifiInvoicePeriodAndLine(
  left: { period: string; line_number: number | null },
  right: { period: string; line_number: number | null },
) {
  return right.period.localeCompare(left.period) || (left.line_number ?? 7) - (right.line_number ?? 7);
}

export function unifiReviewLabel(stage: UnifiInvoiceStage) {
  if (stage === "approved") return "Approved by James";
  if (stage === "archived") return "Archived";
  const reviewer = unifiReviewerForStage[stage].name;
  return `Pending ${reviewer} ${stage === "james" ? "approval" : "verification"}`;
}

const emailLabels = {
  pending: "Email queued",
  sending: "Sending email",
  sent: "Email sent to Joey",
  failed: "Email failed",
  uncertain: "Email confirmation pending",
} satisfies Record<UnifiInvoiceDelivery["status"], string>;

export function unifiEmailLabel(delivery: UnifiInvoiceDelivery | null | undefined) {
  return delivery ? emailLabels[delivery.status] : "Email status unavailable";
}

export function canManageUnifiInvoiceEmail(profile: Pick<Profile, "id" | "is_super_admin" | "username">) {
  return profile.id === unifiReviewerForStage.james.id
    || (profile.is_super_admin && profile.username === "kevinlee3335");
}
