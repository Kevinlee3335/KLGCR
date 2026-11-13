import { ArrowLeft, Check, FileText, Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import controls from "@/components/compliance-controls.module.css";
import { SubmitButton } from "@/components/submit-button";
import { requireRole } from "@/lib/auth";
import { getUnifiInvoice, unifiInvoicePath, unifiReviewerForStage } from "@/lib/unifi-invoices";
import { formatUnifiBillingMonth, formatUnifiDate, formatUnifiDateTime, formatUnifiLine, unifiReviewLabel } from "../display";
import styles from "../unifi-invoices.module.css";
import { reviewUnifiInvoice } from "./actions";

const invoiceId = z.string().uuid();
export default async function UnifiInvoicePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const [profile, { id }, query] = await Promise.all([requireRole(["admin"]), params, searchParams]);
  if (!invoiceId.safeParse(id).success) notFound();
  const invoice = await getUnifiInvoice(id);
  if (!invoice) notFound();

  const stage = invoice.review_stage;
  const approved = stage === "approved";
  const canReview = !approved && unifiReviewerForStage[stage].id === profile.id;
  const month = formatUnifiBillingMonth(invoice.period);
  const line = formatUnifiLine(invoice.line_number);
  const pdfUrl = `/api/unifi-invoices/${invoice.id}/pdf`;
  const history = [
    { title: "Fikri Verify", at: invoice.fikri_verified_at },
    { title: "Kevin Verify", at: invoice.kevin_verified_at },
    { title: "James Approve", at: invoice.james_approved_at },
  ];

  return (
    <AppShell profile={profile} title="TM Unifi Invoices">
      <div className={styles.page}>
        <Link href={unifiInvoicePath} className={`${controls.button} ${controls.secondary}`}>
          <ArrowLeft className={controls.icon} aria-hidden="true" /> All invoices
        </Link>
        {query.saved === "1" && <p className="success" role="status">Review saved.</p>}
        {query.error === "review" && <p className="error" role="alert">Unable to save the review. Refresh and check the assigned reviewer.</p>}
        <section className="panel" aria-labelledby="unifi-invoice-heading">
          <div className={styles.detailHeader}>
            <div>
              <h2 className={styles.panelTitle} id="unifi-invoice-heading">{month} invoice</h2>
            </div>
            <span className={approved ? styles.approved : styles.pending}>{unifiReviewLabel(stage)}</span>
          </div>
          <dl className={styles.metadata}>
            <div><dt>Line</dt><dd className={styles.identifier}>{line}</dd></div>
            <div><dt>Account No.</dt><dd className={styles.identifier}>{invoice.account_number || "—"}</dd></div>
            {invoice.invoice_number && <div><dt>Invoice No.</dt><dd className={styles.identifier}>{invoice.invoice_number}</dd></div>}
            <div><dt>Received date</dt><dd>{invoice.received_at
              ? <time dateTime={invoice.received_at}>{formatUnifiDateTime(invoice.received_at)}</time>
              : "—"}</dd></div>
            <div><dt>Due date</dt><dd className={styles.identifier}>{invoice.due_date
              ? <time dateTime={invoice.due_date}>{formatUnifiDate(invoice.due_date)}</time>
              : "—"}</dd></div>
          </dl>
          <ol className={styles.steps} aria-label="Invoice review history">
            {history.map(step => (
              <li key={step.title}>
                {step.at ? <Check size={17} aria-hidden="true" /> : <span className={styles.emptyStep} aria-hidden="true" />}
                <div>
                  <strong>{step.title}</strong>
                  {step.at ? <time dateTime={step.at}>{formatUnifiDateTime(step.at)}</time> : <span>Pending</span>}
                </div>
              </li>
            ))}
          </ol>
          {canReview && <form action={reviewUnifiInvoice}>
            <input type="hidden" name="id" value={invoice.id} />
            <input type="hidden" name="stage" value={stage} />
            <SubmitButton className={`${controls.button} ${controls.primary}`} pendingText={stage === "james" ? "Approving…" : "Verifying…"}>
              <Check className={controls.icon} aria-hidden="true" />
              {stage === "james" ? "Approve invoice" : `Verify & pass to ${stage === "fikri" ? "Kevin" : "James"}`}
            </SubmitButton>
          </form>}
        </section>
        <section className="panel" aria-labelledby="unifi-invoice-preview">
          <div className={styles.detailHeader}>
            <div className={styles.heading}>
              <FileText size={19} aria-hidden="true" />
              <h2 className={styles.panelTitle} id="unifi-invoice-preview">Invoice PDF</h2>
            </div>
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className={`${controls.button} ${controls.secondary}`}>
              <Printer className={controls.icon} aria-hidden="true" /> Open PDF to print
            </a>
          </div>
          <iframe className={styles.preview} src={pdfUrl} title={`${month} TM Unifi invoice, page one`} loading="lazy" />
        </section>
      </div>
    </AppShell>
  );
}
