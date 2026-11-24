import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth';
import { listUnifiReceipts, unifiReceiptsPath } from '@/lib/unifi-receipts';
import { listUnifiInvoices } from '@/lib/unifi-invoices';
import { getUnifiWebmailConnectionStatus } from '@/lib/unifi-webmail-connection';
import { formatUnifiDateTime, formatUnifiDate, formatUnifiLine, formatUnifiBillingMonth } from '@/app/(dashboard)/admin/unifi-invoices/display';
import controls from '@/components/compliance-controls.module.css';
import { SubmitButton } from '@/components/submit-button';
import { linkUnifiPaymentReceipt } from './actions';
import './receipts.css';

export default async function UnifiReceiptsPage({searchParams}:{searchParams:Promise<{period?:string;invoice?:string;error?:string;saved?:string}>}) {
  const [profile,query,receipts,invoices,connection] = await Promise.all([requireRole(['admin','management_viewer']),searchParams,listUnifiReceipts(),listUnifiInvoices(),getUnifiWebmailConnectionStatus()]);
  const byId = new Map(invoices.map(invoice=>[invoice.id,invoice]));
  const period = query.period && /^\d{4}-\d{2}$/.test(query.period) ? query.period : '';
  const shown = receipts.filter(receipt=>(!query.invoice || receipt.invoice_id===query.invoice)
    && (!period || (byId.get(receipt.invoice_id || '')?.period || receipt.payment_date?.slice(0,7) || receipt.received_at.slice(0,7))===period));
  return <AppShell profile={profile} title="TM Unifi Payment Receipts"><div className="unifi-receipt-page">
    <div className="section-head"><div><p className="eyebrow">Documents</p><h2>TM Unifi Payment Receipts</h2><p>Original receipt emails and attachments from Inbox and Junk / Spam. A received receipt is payment evidence, not a confirmation of the outstanding balance.</p></div>
      <Link href="/documents" className={`${controls.button} ${controls.secondary}`}>All Documents</Link></div>
    {query.error && <p role="alert" className="error">{query.error}</p>}{query.saved==='1' && <p role="status" className="success">Receipt linked to the invoice.</p>}
    <section className="panel"><p>Last receipt check: {connection.receiptCheckedAt ? formatUnifiDateTime(connection.receiptCheckedAt) : 'Not checked yet'} · Folders: {connection.checkedFolders.join(', ') || 'Not checked yet'}</p>
      {connection.receiptLastError && <p className="error">{connection.receiptLastError}</p>}
      <form className="unifi-receipt-filter" method="get"><label>Payment / billing month<input name="period" type="month" defaultValue={period}/></label><button className={`${controls.button} ${controls.primary}`}>Filter</button><Link className={`${controls.button} ${controls.secondary}`} href={unifiReceiptsPath}>Show all</Link><Link className={`${controls.button} ${controls.secondary}`} href="/admin/unifi-invoices">Invoices and sync</Link></form>
    </section>
    {!shown.length && <section className="panel"><p>No payment receipts are archived for this selection.</p></section>}
    {shown.map(receipt=>{const invoice=byId.get(receipt.invoice_id || '');return <section className="panel unifi-receipt-card" key={receipt.id}>
      <header><div><h3>{receipt.receipt_number || receipt.subject}</h3><p>{receipt.account_number || 'Account needs checking'} · {formatUnifiDateTime(receipt.received_at)} · Folder: {receipt.source_folder}</p></div><strong>{invoice ? 'Receipt received / matched' : 'Needs matching'}</strong></header>
      <dl><div><dt>Payment date</dt><dd>{receipt.payment_date ? formatUnifiDate(receipt.payment_date) : 'Needs checking'}</dd></div><div><dt>Receipt amount</dt><dd>{receipt.amount == null ? 'Needs checking' : `RM ${Number(receipt.amount).toFixed(2)}`}</dd></div><div><dt>Invoice</dt><dd>{invoice ? <Link href={`/admin/unifi-invoices/${invoice.id}`}>{formatUnifiBillingMonth(invoice.period)} · {formatUnifiLine(invoice.line_number)} · {invoice.invoice_number}</Link> : 'Not linked'}</dd></div></dl>
      {!receipt.confirmed && <p className="error">This email does not confirm a completed payment. Check the original evidence.</p>}
      <div className="unifi-receipt-files">{receipt.attachments.map((file,index)=><a key={file.storage_path} className={`${controls.button} ${controls.secondary}`} href={`/api/unifi-receipts/${receipt.id}?file=${index}`} target="_blank" rel="noopener noreferrer">View {file.name}</a>)}<a className={`${controls.button} ${controls.secondary}`} href={`/api/unifi-receipts/${receipt.id}?file=email`}>Download original email</a></div>
      <details><summary>View receipt email</summary><p>From: {receipt.sender}</p><pre>{receipt.body_text || 'See the original email and attachments.'}</pre></details>
      {!receipt.invoice_id && receipt.confirmed && profile.role==='admin' && <form action={linkUnifiPaymentReceipt} className="unifi-receipt-filter"><input type="hidden" name="receipt" value={receipt.id}/><label>Confirm matching invoice<select name="invoice" defaultValue="" required><option value="" disabled>Choose the invoice covered by this receipt</option>{invoices.filter(item=>!receipt.account_number || item.account_number===receipt.account_number).map(item=><option key={item.id} value={item.id}>{item.period} · {formatUnifiLine(item.line_number)} · {item.account_number} · {item.invoice_number}</option>)}</select></label><SubmitButton className={`${controls.button} ${controls.primary}`} pendingText="Saving…">Link receipt</SubmitButton></form>}
    </section>;})}
  </div></AppShell>;
}
