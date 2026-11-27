import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { FlexInspectionForm } from "@/components/flex-inspection-form";
import { requireRole } from "@/lib/auth";
import { malaysiaDate } from "@/lib/checkout-occupancy-report";
import {
  FLEX_INSPECTION_PATH,
  FLEX_INSPECTION_ROLES,
  FLEX_INSPECTION_TITLE,
  isFlexPeriod,
} from "@/lib/flex-inspection";
import { loadFlexGroups } from "@/lib/flex-inspection-catalog";
import { flexInspectionMailRecipients } from "@/lib/flex-inspection-mail-settings";
import { FlexReviewPanel } from "@/components/flex-review-panel";
import type { FlexReviewer } from "@/lib/flex-inspection-review";
import { emptyFlexReview } from "@/lib/flex-inspection-review";
import { flexReviewer, isFlexPreview, loadFlexReview } from "@/lib/flex-inspection-review-store";
import { loadFlexInspection } from "@/lib/flex-inspection-store";

export default async function FlexInspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const profile = await requireRole(FLEX_INSPECTION_ROLES);
  const { period: requestedPeriod } = await searchParams;
  const today = malaysiaDate();
  const currentPeriod = today.slice(0, 7);
  const period = typeof requestedPeriod === "string" && isFlexPeriod(requestedPeriod) && requestedPeriod <= currentPeriod
    ? requestedPeriod
    : currentPeriod;
  const preview = isFlexPreview();
  const reviewer = flexReviewer(profile);
  return (
    <AppShell profile={profile} title={FLEX_INSPECTION_TITLE}>
      <div className="section-head">
        <div>
          <p className="eyebrow">Block C &amp; D</p>
          <h2>Monthly fire safety checklist</h2>
        </div>
        <form action={FLEX_INSPECTION_PATH} method="get" className="actions">
          <label className="field">
            <span>Inspection month</span>
            <input type="month" name="period" required defaultValue={period} max={currentPeriod} />
          </label>
          <button type="submit" className="button secondary">Open month</button>
        </form>
      </div>
      <Suspense key={period} fallback={<p className="subtle" role="status">Loading inspection checklist…</p>}>
        <Checklist period={period} today={today} preview={preview} reviewer={reviewer} />
      </Suspense>
    </AppShell>
  );
}


type InspectionContext = { period: string; today: string; preview: boolean; reviewer: FlexReviewer | null };

async function Checklist({ period, today, preview, reviewer }: InspectionContext) {
  const [groups, inspection] = await Promise.all([
    loadFlexGroups().catch(() => null),
    preview ? Promise.resolve({
      period, revision: 0, exceptions: {}, inspectionDate: null, inspectedByName: null, completedAt: null,
    }) : loadFlexInspection(period).catch(() => null),
  ]);
  if (!groups || !inspection) {
    return <section className="panel" role="alert">Unable to load the inspection. Reload this page to try again.</section>;
  }
  return <FlexInspectionForm key={period} groups={groups} inspection={inspection} today={today} preview={preview}
    verification={<Suspense fallback={<p className="subtle" role="status">Loading verification…</p>}>
      <Verification period={period} completed={Boolean(inspection.completedAt)} today={today} preview={preview} reviewer={reviewer} />
    </Suspense>} />;
}

async function Verification({ period, completed, today, preview, reviewer }: InspectionContext & { completed: boolean }) {
  const [review, recipients, { flexInspectionSendDate }] = await Promise.all([
    completed ? loadFlexReview(period).catch(() => null) : emptyFlexReview,
    reviewer ? flexInspectionMailRecipients().catch(() => null) : null,
    import("@/lib/flex-inspection-mail-schedule"),
  ]);
  if (!review) return <p className="error" role="alert">Verification status could not be loaded. Refresh this page.</p>;
  const scheduledDate = flexInspectionSendDate(period);
  return <FlexReviewPanel period={period} initial={review} reviewer={reviewer} preview={preview}
    recipients={recipients} scheduledDate={scheduledDate > today ? scheduledDate : undefined} />;
}
