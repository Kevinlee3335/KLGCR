import { checkoutDateLabel, canStartAfterCheckout } from "@/lib/job-checkout";

export function JobCheckoutNotice({ date, note }: { date?: string | null; note?: string | null }) {
  const due = canStartAfterCheckout(date);
  return <section className="panel job-checkout-notice" aria-label="Waiting for Check-out">
    <h3>Repair after Check-out</h3>
    <p><strong>Check-out date: {date ? checkoutDateLabel(date) : "Date required — contact Admin"}</strong></p>
    <p>{due ? "The check-out date has been reached. Confirm the tenant has checked out before starting repairs." : "Wait until the tenant has checked out before repairing this defect. This job remains open."}</p>
    {note && <p className="subtle">{note}</p>}
  </section>;
}
