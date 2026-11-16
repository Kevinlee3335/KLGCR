"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Clock3 } from "lucide-react";
import { verifyFlexInspection } from "@/lib/flex-inspection-review-actions";
import { emptyFlexReview, type FlexReview, type FlexReviewer } from "@/lib/flex-inspection-review";
import styles from "./flex-inspection-form.module.css";

const reviewers = [
  { key: "kevin", name: "Kevin", field: "kevinVerifiedAt" },
  { key: "fikri", name: "Fikri", field: "fikriVerifiedAt" },
] as const;

const timeFormat = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short",
});

function mailMessage(review: FlexReview, preview: boolean) {
  if (!review.kevinVerifiedAt || !review.fikriVerifiedAt) {
    return "Both verifications are required before the reports are emailed to Flex.";
  }
  if (preview) return "Both verified. The Flex email is simulated in this preview.";
  if (review.mailStatus === "sent" && review.sentAt) return `Emailed to Flex · ${timeFormat.format(new Date(review.sentAt))}`;
  if (review.mailStatus === "failed" || review.mailStatus === "uncertain") {
    return review.error || "Flex email delivery needs review.";
  }
  return review.mailStatus === "sending" ? "Sending the reports to Flex…" : "Both verified. Flex email is queued.";
}

export function FlexReviewPanel({ period, initial, reviewer, preview }: {
  period: string;
  initial: FlexReview;
  reviewer: FlexReviewer | null;
  preview: boolean;
}) {
  const storageKey = `flex-preview-review-${period}`;
  const [local, setLocal] = useState<FlexReview | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const review = local ?? initial;

  useEffect(() => {
    if (!preview) return;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) setLocal({ ...emptyFlexReview, ...JSON.parse(saved) });
    } catch {
      // The preview remains usable when browser storage is disabled.
    }
  }, [preview, storageKey]);

  function verify(slot: typeof reviewers[number]) {
    setError("");
    if (preview) {
      const next = { ...review, [slot.field]: new Date().toISOString() };
      setLocal(next);
      try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Preview state remains on screen. */ }
      return;
    }
    startTransition(async () => {
      try {
        const result = await verifyFlexInspection(period);
        if (result.ok) setLocal(result.review);
        else setError(result.message);
      } catch {
        setError("Unable to verify this inspection. Try again.");
      }
    });
  }

  return (
    <section className={styles.review} aria-label="Flex verification">
      <strong>Verification</strong>
      <ul className={styles.reviewSlots}>
        {reviewers.map((slot) => {
          const verified = review[slot.field];
          return (
            <li key={slot.key}>
              <div>
                <strong>{slot.name}</strong>
                <span>{verified ? <Check aria-hidden="true" size={16} /> : <Clock3 aria-hidden="true" size={16} />}
                  {verified ? `Verified · ${timeFormat.format(new Date(verified))}` : "Waiting for verification"}
                </span>
              </div>
              {!verified && (preview || reviewer === slot.key) ? (
                <button type="button" className={styles.secondaryAction} disabled={pending} onClick={() => verify(slot)}>
                  {preview ? `Verify as ${slot.name}` : "Verify"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className={styles.instructions} role="status">{mailMessage(review, preview)}</p>
      {!preview && review.kevinVerifiedAt && review.fikriVerifiedAt && review.mailStatus !== "sent" ? (
        <a href={`/flex-inspections?period=${period}`} className={styles.reload}>Refresh email status</a>
      ) : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}
