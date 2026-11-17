import { ClipboardList, FolderOpen } from "lucide-react";
import { loadAbInspectionGroups } from "@/lib/ab-inspection-catalog";
import { AppShell } from "@/components/app-shell";
import { FlexInspectionForm } from "@/components/flex-inspection-form";
import styles from "@/components/flex-inspection-form.module.css";
import { requireRole } from "@/lib/auth";
import { malaysiaDate } from "@/lib/checkout-occupancy-report";
import {
  FLEX_INSPECTION_PATH,
  FLEX_INSPECTION_ROLES,
  FLEX_INSPECTION_TITLE,
  isFlexPeriod,
} from "@/lib/flex-inspection";
import { loadFlexGroups } from "@/lib/flex-inspection-catalog";
import { flexInspectionSendDate } from "@/lib/flex-inspection-mail-schedule";
import { flexInspectionMailRecipients } from "@/lib/flex-inspection-mail-settings";
import { emptyFlexReview } from "@/lib/flex-inspection-review";
import { flexReviewer, isFlexPreview, loadFlexReview } from "@/lib/flex-inspection-review-store";
import { loadFlexInspection } from "@/lib/flex-inspection-store";

export default async function FlexInspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; scope?: string }>;
}) {
  const profile = await requireRole(FLEX_INSPECTION_ROLES);
  const { period: requestedPeriod, scope: requestedScope } = await searchParams;
  const scope = requestedScope === "ab" ? "ab" : "cd";
  const isAb = scope === "ab";
  const today = malaysiaDate();
  const currentPeriod = today.slice(0, 7);
  const period = typeof requestedPeriod === "string" && isFlexPeriod(requestedPeriod) && requestedPeriod <= currentPeriod
    ? requestedPeriod
    : currentPeriod;
  const preview = isFlexPreview();
  const reviewer = isAb ? null : flexReviewer(profile);
  const scheduledDate = isAb ? undefined : flexInspectionSendDate(period);

  const [groups, inspection, recipients] = await Promise.all([
    isAb ? loadAbInspectionGroups() : loadFlexGroups().catch(() => null),
    preview ? Promise.resolve({
      period, revision: 0, exceptions: {}, inspectionDate: null, inspectedByName: null, completedAt: null,
    }) : loadFlexInspection(period, scope).catch(() => null),
    reviewer ? flexInspectionMailRecipients().catch(() => null) : null,
  ]);
  const review = isAb ? undefined : inspection?.completedAt
    ? await loadFlexReview(period).catch(() => null)
    : emptyFlexReview;

  return (
    <AppShell profile={profile} title={FLEX_INSPECTION_TITLE}>
      <div className={styles.inspectionNav}>
        <nav aria-label="Fire safety inspection blocks" className={styles.scopeTabs}>
          <a href={`${FLEX_INSPECTION_PATH}?scope=ab&period=${period}`} aria-current={isAb ? "page" : undefined}>
            <ClipboardList size={17} aria-hidden="true" /> Block A &amp; B
          </a>
          <a href={`${FLEX_INSPECTION_PATH}?period=${period}`} aria-current={isAb ? undefined : "page"}>
            <ClipboardList size={17} aria-hidden="true" /> Block C &amp; D
          </a>
        </nav>
        <a className={styles.archiveLink} href={`/documents/fire-safety-inspections/${scope}`}>
          <FolderOpen size={17} aria-hidden="true" /> Monthly PDF archive
        </a>
      </div>
      <div className="section-head">
        <div>
          <p className="eyebrow">{isAb ? "Block A & B" : "Block C & D · Flex"}</p>
          <h2>Monthly fire safety checklist</h2>
        </div>
        <form action={FLEX_INSPECTION_PATH} method="get" className="actions">
          {isAb ? <input type="hidden" name="scope" value={scope} /> : null}
          <label className="field">
            <span>Inspection month</span>
            <input type="month" name="period" required defaultValue={period} max={currentPeriod} />
          </label>
          <button type="submit" className="button secondary">Open month</button>
        </form>
      </div>
      {groups && inspection ? (
        <FlexInspectionForm key={`${scope}-${period}`} groups={groups} inspection={inspection} today={today} scope={scope}
          preview={preview} reviewer={reviewer} review={review} recipients={recipients}
          scheduledDate={scheduledDate && scheduledDate > today ? scheduledDate : undefined} />
      ) : (
        <section className="panel" role="alert">
          Unable to load the inspection. Reload this page to try again.
        </section>
      )}
    </AppShell>
  );
}
