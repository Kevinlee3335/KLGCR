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

  const [groups, inspection, recipients] = await Promise.all([
    loadFlexGroups().catch(() => null),
    preview ? Promise.resolve({
      period, revision: 0, exceptions: {}, inspectionDate: null, inspectedByName: null, completedAt: null,
    }) : loadFlexInspection(period).catch(() => null),
    reviewer ? flexInspectionMailRecipients().catch(() => null) : null,
  ]);
  const review = inspection?.completedAt ? await loadFlexReview(period).catch(() => null) : emptyFlexReview;

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
      {groups && inspection ? (
        <FlexInspectionForm key={period} groups={groups} inspection={inspection} today={today}
          preview={preview} reviewer={reviewer} review={review} recipients={recipients} />
      ) : (
        <section className="panel" role="alert">
          Unable to load the inspection. Reload this page to try again.
        </section>
      )}
    </AppShell>
  );
}
