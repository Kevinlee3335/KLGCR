"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DocumentDelivery } from "@/app/api/document-review/[type]/[id]/delivery/route";

const statusDisplay: Record<DocumentDelivery["status"], { label: string; className: string }> = {
  pending: { label: "Awaiting delivery", className: "status-pending" },
  sending: { label: "Sending", className: "status-in_progress" },
  sent: { label: "Sent", className: "status-completed" },
  blocked: { label: "Delivery blocked", className: "status-rejected" },
  failed: { label: "Delivery failed", className: "status-rejected" },
  uncertain: { label: "Delivery needs checking", className: "status-pending" },
  not_queued: { label: "No email queued", className: "status-pending" },
};
const sentTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur",
});
const REFRESH_INTERVAL_MS = 5_000;
const MAX_REFRESHES = 10;

export function DocumentDeliveryStatus({ type, id }: { type: "billing" | "gym"; id: string }) {
  const [delivery, setDelivery] = useState<DocumentDelivery | null>(null);
  const [checking, setChecking] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let stopped = false;
    let retry: number | undefined;
    let controller: AbortController | undefined;

    async function load(remaining: number) {
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 8_000);
      try {
        const response = await fetch(`/api/document-review/${type}/${id}/delivery`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw Error("Unable to check email delivery.");
        const next: DocumentDelivery = await response.json();
        if (stopped) return;
        setDelivery(next);
        setHasError(false);
        if (remaining > 0 && (next.status === "pending" || next.status === "sending")) {
          retry = window.setTimeout(() => { void load(remaining - 1); }, REFRESH_INTERVAL_MS);
        }
      } catch {
        if (!stopped) setHasError(true);
      } finally {
        window.clearTimeout(timeout);
        if (!stopped) setChecking(false);
      }
    }

    void load(MAX_REFRESHES);
    return () => {
      stopped = true;
      window.clearTimeout(retry);
      controller?.abort();
    };
  }, [type, id, refresh]);

  const display = delivery && statusDisplay[delivery.status];
  const sentAt = delivery?.status === "sent" ? delivery.sentAt : null;
  const billingNeedsAttention = type === "billing" && delivery &&
    (delivery.status === "blocked" || delivery.status === "failed" || delivery.status === "uncertain" || delivery.status === "not_queued");

  return (
    <div className="actions" style={{ flexWrap: "wrap", marginTop: 16 }}>
      <div role="status" aria-live="polite">
        <span className="subtle">Email to Accounts</span>{" "}
        {display ? <strong className={`status-badge ${display.className}`}>{display.label}</strong>
          : !hasError && <span>Checking…</span>}
        {sentAt && <time dateTime={sentAt} className="subtle"> {sentTime.format(new Date(sentAt))} MYT</time>}
        {hasError && <span> Unable to refresh email status.</span>}
      </div>
      {delivery?.status !== "sent" && (
        <button type="button" className="button secondary button-compact" disabled={checking} onClick={() => {
          setChecking(true);
          setRefresh(value => value + 1);
        }}>
          Check status
        </button>
      )}
      {billingNeedsAttention && (
        <Link href={`/admin/billing#invoice-${id}`} className="text-link">Open invoice history</Link>
      )}
    </div>
  );
}
