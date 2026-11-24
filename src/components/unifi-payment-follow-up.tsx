import { DashboardActionFollowUp } from './dashboard-action-follow-up';
import { listUnifiReceipts, unifiReceiptsPath } from '@/lib/unifi-receipts';
import { listUnifiInvoices, unifiInvoicePath } from '@/lib/unifi-invoices';
import { unifiPaymentFollowups } from '@/lib/unifi-receipt-details';
import { getUnifiWebmailConnectionStatus } from '@/lib/unifi-webmail-connection';
import { unifiWebmailFollowUpHealth } from '@/lib/unifi-invoice-follow-up';
import { formatUnifiDate, formatUnifiLine, formatUnifiBillingMonth } from '@/app/(dashboard)/admin/unifi-invoices/display';

export async function UnifiPaymentFollowUp() {
  try {
    const [invoices,receipts,connection] = await Promise.all([listUnifiInvoices(),listUnifiReceipts(),getUnifiWebmailConnectionStatus()]);
    const missing = unifiPaymentFollowups(invoices,receipts);
    const needsMatching = receipts.filter(receipt=>!receipt.invoice_id && (receipt.payment_date || receipt.received_at).slice(0,7)>='2026-11');
    const fresh = unifiWebmailFollowUpHealth({connected:connection.connected,lastCheckedAt:connection.receiptCheckedAt,lastError:connection.receiptLastError},new Date()) === 'ready';
    return <>
      <DashboardActionFollowUp title="TM Unifi Payment Check" count={missing.length}
        subtitle={fresh ? 'Payment receipt checks start 7 days before each invoice due date. Items stay here until a receipt is matched.' : 'Receipt sync needs a fresh successful check. Payment receipt status has not been confirmed.'}
        items={missing.slice(0,12).map(invoice=>({id:invoice.id,name:`${formatUnifiBillingMonth(invoice.period)} · ${formatUnifiLine(invoice.line_number)}`,
          detail:`Account ${invoice.account_number || '-'} · ${fresh ? 'No matched payment receipt received' : 'Check receipt sync and payment evidence'}`,
          meta:`Due ${formatUnifiDate(invoice.due_date!)}`,href:`${unifiInvoicePath}/${invoice.id}`}))}
        href={unifiReceiptsPath} action="Check receipt" nameColumn="Month / line" detailColumn="Payment receipt" metaColumn="Due date" />
      <DashboardActionFollowUp title="TM Unifi Receipts Need Matching" count={needsMatching.length}
        subtitle="These receipt emails are archived in Documents. Confirm which invoice each receipt covers."
        items={needsMatching.slice(0,10).map(receipt=>({id:receipt.id,name:receipt.account_number || 'Account needs checking',detail:receipt.subject,meta:formatUnifiDate(receipt.received_at)}))}
        href={unifiReceiptsPath} action="Match receipt" nameColumn="Account" detailColumn="Receipt email" metaColumn="Received" />
    </>;
  } catch {
    return <DashboardActionFollowUp title="TM Unifi Payment Check Unavailable" count={1} subtitle="Open the receipt archive to check the latest sync and payment evidence."
      items={[{id:'receipt-sync',name:'Receipt check',detail:'Unable to load payment receipts. Please check the Webmail sync.'}]}
      href={unifiInvoicePath} action="Check sync" />;
  }
}
