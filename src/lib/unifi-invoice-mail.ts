import { createHash, randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { gmailGateway } from './billing-mail';
import { BILLING_MAIL_FROM, BILLING_MAIL_TO } from './billing-mail-settings';
import { createAdminClient } from './supabase/admin';
import { downloadUnifiInvoice, getUnifiInvoice } from './unifi-invoices';

export type UnifiInvoiceDelivery = {
  invoice_id: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'uncertain';
  attempted_at: string | null;
  sent_at: string | null;
  error: string | null;
};

const table = 'unifi_invoice_delivery';
const fields = 'invoice_id,status,attempted_at,sent_at,error';
const maxEmailPdfBytes = 12_000_000;
const uncertain = 'Gmail could not confirm delivery. Check the company noreply Sent folder. Checking again uses the same delivery key.';
type AdminClient = ReturnType<typeof createAdminClient>;
type Outcome = Pick<UnifiInvoiceDelivery, 'status' | 'sent_at' | 'error'>;

function gatewayKey(invoiceId: string) {
  const hash = createHash('sha256').update('KLGCR TM Unifi invoice\n' + invoiceId.toLowerCase()).digest('hex');
  const variant = (8 | (parseInt(hash[16], 16) & 3)).toString(16);
  // Finance requires an invoice-prefixed UUID. Version 8 separates this scoped key from customer invoice UUIDs.
  return `invoice_${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function loadDelivery(db: AdminClient, invoiceId: string): Promise<UnifiInvoiceDelivery | null> {
  const result = await db.from(table).select(fields).eq('invoice_id', invoiceId).maybeSingle();
  if (result.error) throw Error('Unable to read the TM Unifi email status.');
  return result.data as UnifiInvoiceDelivery | null;
}

export function getUnifiInvoiceDelivery(invoiceId: string) {
  return loadDelivery(createAdminClient(), invoiceId);
}

export async function listUnifiInvoiceDeliveries(invoiceIds: string[]) {
  const db = createAdminClient();
  const batches = Array.from({ length: Math.ceil(invoiceIds.length / 100) }, (_, index) =>
    db.from(table).select(fields).in('invoice_id', invoiceIds.slice(index * 100, (index + 1) * 100)));
  const results = await Promise.all(batches);
  if (results.some(result => result.error)) throw Error('Unable to read TM Unifi email statuses.');
  return new Map(results.flatMap(result => (result.data as UnifiInvoiceDelivery[]).map(row => [row.invoice_id, row])));
}

async function sendInvoice(invoiceId: string): Promise<Outcome> {
  let started = false;
  try {
    const invoice = await getUnifiInvoice(invoiceId);
    if (invoice?.review_stage !== 'approved' || !invoice.james_approved_at) {
      return { status: 'failed', sent_at: null, error: 'James approval is required before sending this invoice.' };
    }

    const attachment = await downloadUnifiInvoice(invoiceId);
    if (!attachment || attachment.bytes.length > maxEmailPdfBytes) {
      return { status: 'failed', sent_at: null, error: 'The invoice first page is missing or exceeds the 12 MB email limit.' };
    }
    const pdf = Buffer.from(attachment.bytes);
    const document = await PDFDocument.load(pdf, { updateMetadata: false });
    if (document.getPageCount() !== 1) {
      return { status: 'failed', sent_at: null, error: 'Only the first page of the invoice can be emailed.' };
    }

    const key = gatewayKey(invoiceId);
    const line = invoice.line_number ? ` · Line ${invoice.line_number}` : '';
    const text = [
      'Dear Joey,',
      `Attached is the TM Unifi invoice approved by James for ${invoice.period}${line}.`,
      invoice.invoice_number ? `Invoice number: ${invoice.invoice_number}` : null,
      invoice.due_date ? `Due date: ${invoice.due_date.split('-').reverse().join('/')}` : null,
      'KLG Campus Residence Management',
    ].filter(Boolean).join('\n\n');
    const cleanName = attachment.fileName.replace(/[^a-z0-9._-]/gi, '_').slice(0, 175);
    const fileName = /\.pdf$/i.test(cleanName) ? cleanName : `${cleanName || 'TM-Unifi-invoice'}.pdf`;

    started = true;
    const result = await gmailGateway({
      action: 'finance-send',
      key,
      from: BILLING_MAIL_FROM,
      to: BILLING_MAIL_TO,
      subject: `Approved TM Unifi invoice · ${invoice.period}${line}`,
      text,
      fileName,
      pdfBase64: pdf.toString('base64'),
    }, 25_000);
    if (result.ok === true && result.status === 'sent' && result.key === key
        && result.sender === BILLING_MAIL_FROM && result.to === BILLING_MAIL_TO
        && typeof result.sentAt === 'string' && Number.isFinite(Date.parse(result.sentAt))) {
      return { status: 'sent', sent_at: result.sentAt, error: null };
    }
    if (result.status === 'busy') {
      return { status: 'pending', sent_at: null, error: 'The company Gmail gateway is busy. This email remains queued.' };
    }
    if (result.status === 'rejected') {
      return { status: 'failed', sent_at: null, error: 'The company Gmail gateway did not accept the invoice email. Check the connection and retry.' };
    }
  } catch {
    if (!started) return { status: 'failed', sent_at: null, error: 'Unable to prepare the first-page invoice PDF.' };
  }
  return { status: 'uncertain', sent_at: null, error: uncertain };
}

export async function dispatchUnifiInvoiceMail(invoiceId: string): Promise<UnifiInvoiceDelivery | null> {
  const db = createAdminClient();
  const token = randomUUID();
  const claim = await db.rpc('claim_unifi_invoice_delivery', { p_invoice_id: invoiceId, p_claim_token: token });
  if (claim.error) throw Error('Unable to claim the TM Unifi invoice email.');
  if (!claim.data) return loadDelivery(db, invoiceId);

  const previousUncertain = claim.data === 'uncertain' || claim.data === 'sending';
  let outcome = await sendInvoice(invoiceId);
  if (previousUncertain && outcome.status !== 'sent') outcome = { status: 'uncertain', sent_at: null, error: uncertain };
  const saved = await db.from(table).update({ ...outcome, locked_until: null, claim_token: null })
    .eq('invoice_id', invoiceId).eq('status', 'sending').eq('claim_token', token).select(fields).maybeSingle();
  if (saved.error || !saved.data) throw Error('Unable to save the TM Unifi email status. Checking again uses the same delivery key.');
  return saved.data as UnifiInvoiceDelivery;
}

export async function retryQueuedUnifiInvoiceMail() {
  const queue = await createAdminClient().from(table).select('invoice_id')
    .or(`status.in.(pending,failed,uncertain),and(status.eq.sending,locked_until.lte.${new Date().toISOString()})`)
    .order('attempted_at', { nullsFirst: true }).order('created_at').order('invoice_id').limit(4);
  if (queue.error) throw Error('Unable to read the TM Unifi invoice email queue.');

  for (const { invoice_id } of queue.data) {
    try {
      await dispatchUnifiInvoiceMail(invoice_id);
    } catch {
      console.error('Queued TM Unifi invoice email needs review', { invoiceId: invoice_id });
    }
  }
}
