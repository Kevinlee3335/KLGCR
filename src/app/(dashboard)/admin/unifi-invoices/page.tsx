import { ArrowUpRight, FileText, Link2, RefreshCw, Upload } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import controls from "@/components/compliance-controls.module.css";
import { requireRole } from "@/lib/auth";
import { listUnifiInvoices, unifiInvoicePath, unifiReviewerForStage } from "@/lib/unifi-invoices";
import { getUnifiWebmailConnectionStatus } from "@/lib/unifi-webmail-connection";
import { compareUnifiInvoicePeriodAndLine, formatUnifiBillingMonth, formatUnifiDate, formatUnifiDateTime, formatUnifiLine, unifiReviewLabel } from "./display";
import styles from "./unifi-invoices.module.css";

export default async function UnifiInvoicesPage({ searchParams }: {
  searchParams: Promise<{ imported?: string; connected?: string; synced?: string; error?: string }>;
}) {
  const [profile, query] = await Promise.all([requireRole(["admin"]), searchParams]);
  const canConnectWebmail = profile.is_super_admin && profile.username === "kevinlee3335";
  const [invoices, connection] = await Promise.all([
    listUnifiInvoices().catch(() => null),
    canConnectWebmail ? getUnifiWebmailConnectionStatus().catch(() => null) : null,
  ]);
  const approved = invoices?.filter(invoice => invoice.review_stage === "approved").length ?? 0;
  const sortedInvoices = invoices?.slice().sort(compareUnifiInvoicePeriodAndLine);
  const syncedCount = typeof query.synced === "string" && /^\d+$/.test(query.synced) ? Number(query.synced) : null;

  return (
    <AppShell profile={profile} title="TM Unifi Invoices">
      <div className={styles.page}>
        {query.imported === "1" && <p className="success" role="status">Invoice saved. Open the record to see its review status.</p>}
        {canConnectWebmail && query.connected === "1" && <p className="success" role="status">Webmail connected.</p>}
        {canConnectWebmail && syncedCount !== null && <p className="success" role="status">
          {syncedCount === 0 ? "Webmail checked. No new invoices were imported." : `Imported ${syncedCount} new ${syncedCount === 1 ? "invoice" : "invoices"}.`}
        </p>}
        {typeof query.error === "string" && <p className="error" role="alert">{query.error}</p>}
        <section className={styles.list} aria-labelledby="unifi-invoice-list">
          <header className={styles.header}>
            <div className={styles.heading}>
              <span className={styles.icon}><FileText size={22} aria-hidden="true" /></span>
              <div>
                <h2 id="unifi-invoice-list">TM Unifi invoices</h2>
                <p>Fikri Verify → Kevin Verify → James Approve</p>
              </div>
            </div>
            {invoices && <dl className={styles.counts}>
              <div><dt>Pending</dt><dd>{invoices.length - approved}</dd></div>
              <div><dt>Approved</dt><dd>{approved}</dd></div>
            </dl>}
          </header>
          {!invoices ? (
            <p className={styles.empty} role="alert">Unable to load TM Unifi invoices. Please refresh.</p>
          ) : invoices.length === 0 ? (
            <p className={styles.empty}>No TM Unifi invoices have been imported.</p>
          ) : (
            <div className={styles.scroll} role="region" aria-label="TM Unifi invoices" tabIndex={0}>
              <table className={styles.table}>
                <thead><tr>
                  <th scope="col">Billing month</th>
                  <th scope="col">Line</th>
                  <th scope="col">Account No.</th>
                  <th scope="col">Invoice</th>
                  <th scope="col">Received date</th>
                  <th scope="col">Due date</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr></thead>
                <tbody>
                  {sortedInvoices?.map(invoice => {
                    const stage = invoice.review_stage;
                    const isApproved = stage === "approved";
                    const canReview = !isApproved && unifiReviewerForStage[stage].id === profile.id;
                    const month = formatUnifiBillingMonth(invoice.period);
                    const line = formatUnifiLine(invoice.line_number);
                    return (
                      <tr key={invoice.id}>
                        <th scope="row">{month}</th>
                        <td className={styles.identifier}>{line}</td>
                        <td className={styles.identifier}>{invoice.account_number || "—"}</td>
                        <td>{invoice.invoice_number || invoice.file_name}</td>
                        <td className={styles.identifier}>{invoice.received_at
                          ? <time dateTime={invoice.received_at}>{formatUnifiDate(invoice.received_at)}</time>
                          : "—"}</td>
                        <td className={styles.identifier}>{invoice.due_date
                          ? <time dateTime={invoice.due_date}>{formatUnifiDate(invoice.due_date)}</time>
                          : "—"}</td>
                        <td><span className={isApproved ? styles.approved : styles.pending}>{unifiReviewLabel(stage)}</span></td>
                        <td>
                          <Link href={`${unifiInvoicePath}/${invoice.id}`} className={`${controls.button} ${canReview ? controls.primary : controls.secondary} ${controls.small}`} aria-label={`${canReview ? "Review" : "Open"} ${month} invoice · ${line}`}>
                            {canReview ? "Review" : "Open"} <ArrowUpRight size={15} aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {canConnectWebmail && <section className="panel" aria-labelledby="unifi-connection-heading">
          <div className={styles.detailHeader}>
            <h2 id="unifi-connection-heading" className={styles.panelTitle}>Webmail connection</h2>
            {connection && <span className={connection.connected ? styles.approved : styles.pending}>
              {connection.connected ? "Connected" : "Not connected"}
            </span>}
          </div>
          <dl className={styles.connectionFields}>
            <div><dt>Mailbox</dt><dd>project@keanlenggroup.com</dd></div>
            <div><dt>Mail server</dt><dd>mail.keanlenggroup.com</dd></div>
            {connection?.connected && <div><dt>Automatic check</dt><dd>Daily at 9:00 AM MYT</dd></div>}
            {connection?.lastCheckedAt && <div><dt>Last checked</dt><dd>
              <time dateTime={connection.lastCheckedAt}>{formatUnifiDateTime(connection.lastCheckedAt)}</time>
            </dd></div>}
          </dl>
          {!connection && <p className="error" role="alert">Unable to check Webmail connection status. Please refresh.</p>}
          {connection?.lastError && <p className="error" role="alert">{connection.lastError}</p>}
          <div className={styles.connectionActions}>
            <form className={styles.connectionForm} method="post" action="/api/unifi-invoices/connection">
              <label className={controls.label}>Webmail password
                <input className={controls.input} type="password" name="password" required autoComplete="off" />
              </label>
              <button className={`${controls.button} ${controls.primary}`} type="submit">
                <Link2 className={controls.icon} aria-hidden="true" /> {connection?.connected ? "Update connection" : "Connect Webmail"}
              </button>
            </form>
            {connection?.connected && <form method="post" action="/api/unifi-invoices/sync">
              <button className={`${controls.button} ${controls.secondary}`} type="submit">
                <RefreshCw className={controls.icon} aria-hidden="true" /> Sync now
              </button>
            </form>}
          </div>
        </section>}
        <section className="panel" aria-labelledby="unifi-import-heading">
          <h2 id="unifi-import-heading" className={styles.panelTitle}>Upload invoice</h2>
          <p className={styles.description}>Select the billing month and original PDF. KLGCR saves page one for review.</p>
          <form className={styles.uploadForm} method="post" action="/api/unifi-invoices/import" encType="multipart/form-data">
            <label className={controls.label}>Billing month
              <input className={controls.input} name="billingMonth" type="month" min="2026-09" required />
            </label>
            <label className={controls.label}>Invoice number (optional)
              <input className={controls.input} name="invoiceNumber" type="text" maxLength={100} />
            </label>
            <label className={`${controls.label} ${styles.fileField}`}>Invoice PDF
              <input className={controls.file} type="file" name="file" accept=".pdf,application/pdf" required />
            </label>
            <button className={`${controls.button} ${controls.primary}`} type="submit">
              <Upload className={controls.icon} aria-hidden="true" /> Upload
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
