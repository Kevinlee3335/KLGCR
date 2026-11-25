import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createAdminClient } from './supabase/admin';
import { sendFinancePdf } from './finance-mail';
import { depositReceiptPdf, paymentVoucherPdf } from './deposit-document-pdf';
import { signatureSchema, type Signature } from './purchase-orders/signature';

export type DepositDocumentKind = 'receipt' | 'voucher';
export type DepositEmailStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'not_required';
type DeliveryFields = {
  id: string; payer: string; email: string; member_reference: string; amount: number | string;
  created_at: string; pdf_path: string | null; pdf_error: string | null;
  email_status: DepositEmailStatus; email_error: string | null; emailed_at: string | null;
  delivery_claim_token: string | null; delivery_claimed_at: string | null;
};
export type DepositReceiptRecord = DeliveryFields & {
  receipt_no: string; source_module: string; member_id: string; received_on: string;
  received_by: string; received_by_name: string; issuer_signature: Signature | null;
  origin: 'received' | 'existing'; original_receipt_no: string | null; note: string | null;
  status: 'held' | 'refunded';
};
export type PaymentVoucherRecord = DeliveryFields & {
  voucher_no: string; source_module: string; deposit_receipt_id: string; paid_on: string;
  refunded_by: string; refunded_by_name: string; refund_signature: Signature;
};
export const depositDocumentTable = (kind: DepositDocumentKind) => kind === 'receipt' ? 'deposit_receipts' : 'payment_vouchers';
const bucket = 'deposit-documents';
const pathFor = (kind: DepositDocumentKind, id: string) => `${kind === 'receipt' ? 'receipts' : 'vouchers'}/${id}.pdf`;
const numberFor = (kind: DepositDocumentKind, row: DepositReceiptRecord | PaymentVoucherRecord) => kind === 'receipt'
  ? (row as DepositReceiptRecord).receipt_no : (row as PaymentVoucherRecord).voucher_no;
export const depositDocumentFilename = (kind: DepositDocumentKind, row: DepositReceiptRecord | PaymentVoucherRecord) =>
  numberFor(kind, row).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 100) + '.pdf';

export async function loadDepositDocument(kind: DepositDocumentKind, id: string) {
  const { data, error } = await createAdminClient().from(depositDocumentTable(kind)).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error('Unable to load the deposit document. Please try again.');
  if (!data) throw new Error('Deposit document not found.');
  return data as DepositReceiptRecord | PaymentVoucherRecord;
}

/** The first generated PDF is archived privately; later downloads reuse those exact bytes. */
export async function ensureDepositDocumentPdf(kind: DepositDocumentKind, row: DepositReceiptRecord | PaymentVoucherRecord): Promise<Buffer> {
  const db = createAdminClient();
  const path = pathFor(kind, row.id);
  try {
    if (row.pdf_path) {
      if (row.pdf_path !== path) throw new Error('The archived document path needs review.');
      const file = await db.storage.from(bucket).download(path);
      if (file.error || !file.data) throw new Error('Unable to open the archived PDF. Please try again.');
      return Buffer.from(await file.data.arrayBuffer());
    }
    // Recover an upload that succeeded before its database status was saved.
    const prior = await db.storage.from(bucket).download(path);
    if (!prior.error && prior.data) {
      const saved = await db.from(depositDocumentTable(kind)).update({ pdf_path: path, pdf_error: null }).eq('id', row.id).is('pdf_path', null);
      if (saved.error) throw new Error('The PDF is archived, but its status needs a retry.');
      return Buffer.from(await prior.data.arrayBuffer());
    }
    let bytes: Buffer;
    if (kind === 'receipt') {
      const receipt = row as DepositReceiptRecord;
      const parsed = signatureSchema.safeParse(receipt.issuer_signature);
      bytes = await depositReceiptPdf({ ...receipt, amount: Number(receipt.amount), issuer_signature: parsed.success ? parsed.data : null });
    } else {
      const voucher = row as PaymentVoucherRecord;
      const parsed = signatureSchema.safeParse(voucher.refund_signature);
      if (!parsed.success) throw new Error('The refunding staff signature needs review.');
      const original = await db.from('deposit_receipts').select('receipt_no').eq('id', voucher.deposit_receipt_id).single();
      if (original.error || !original.data) throw new Error('Unable to load the original deposit receipt.');
      bytes = await paymentVoucherPdf({ ...voucher, amount: Number(voucher.amount), refund_signature: parsed.data, original_receipt_no: original.data.receipt_no });
    }
    const uploaded = await db.storage.from(bucket).upload(path, bytes, { contentType: 'application/pdf', upsert: false });
    if (uploaded.error) {
      // Another request may have archived the same immutable document first.
      const existing = await db.storage.from(bucket).download(path);
      if (existing.error || !existing.data) throw new Error('PDF archiving failed. The cash record is saved; retry this document.');
      bytes = Buffer.from(await existing.data.arrayBuffer());
    }
    const saved = await db.from(depositDocumentTable(kind)).update({ pdf_path: path, pdf_error: null }).eq('id', row.id).is('pdf_path', null);
    if (saved.error) throw new Error('The PDF is archived, but its status needs a retry.');
    return bytes;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to prepare the PDF. The cash record is saved.';
    await db.from(depositDocumentTable(kind)).update({ pdf_error: message }).eq('id', row.id).is('pdf_path', null);
    throw new Error(message);
  }
}

/** Uses a leased claim and the existing Gmail gateway's delivery key to make retries safe. */
export async function deliverDepositDocument(kind: DepositDocumentKind, id: string) {
  const db = createAdminClient();
  const row = await loadDepositDocument(kind, id);
  // Historical opening balances must never produce a new-cash receipt email.
  if ((kind === 'receipt' && (row as DepositReceiptRecord).origin === 'existing') || row.email_status === 'not_required') {
    const attempt = await db.from(depositDocumentTable(kind)).update({ email_status: 'not_required', delivery_claimed_at: new Date().toISOString() }).eq('id', id);
    if (attempt.error) throw new Error('Unable to start PDF archiving. The existing deposit remains recorded.');
    await ensureDepositDocumentPdf(kind, row);
    return { status: 'not_required' as const };
  }
  if (row.email_status === 'sent') return { status: 'sent' as const };
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const token = randomUUID();
  const claimed = await db.from(depositDocumentTable(kind)).update({ email_status: 'sending', delivery_claim_token: token, delivery_claimed_at: now, email_error: null })
    .eq('id', id).or(`email_status.in.(pending,failed),and(email_status.eq.sending,delivery_claimed_at.lt.${cutoff})`).select('*').maybeSingle();
  if (claimed.error) throw new Error('Unable to start document delivery. The cash record is saved.');
  if (!claimed.data) return { status: 'sending' as const };
  const document = claimed.data as DepositReceiptRecord | PaymentVoucherRecord;
  try {
    const bytes = await ensureDepositDocumentPdf(kind, document);
    const to = z.string().trim().email().max(254).safeParse(document.email);
    if (!to.success) throw new Error('The email saved with this document is missing or invalid. Delivery needs a Management review; the cash transaction remains recorded.');
    const number = numberFor(kind, document);
    const title = kind === 'receipt' ? 'Gym Deposit Receipt' : 'Gym Deposit Refund - Payment Voucher';
    const details = kind === 'receipt'
      ? `We have received your refundable gym deposit of RM ${Number(document.amount).toFixed(2)} in cash.\nDeposit Receipt No.: ${number}`
      : `Your gym deposit of RM ${Number(document.amount).toFixed(2)} has been refunded in cash.\nPayment Voucher No.: ${number}`;
    await sendFinancePdf({ key: `deposit_document_${kind}_${id}`, to: to.data, subject: `${title} ${number}`,
      text: `Dear ${document.payer},\n\n${details}\n\nPlease find your ${kind === 'receipt' ? 'deposit receipt' : 'payment voucher'} attached.\n\nKLG Campus Residence Management`,
      pdf: bytes, fileName: depositDocumentFilename(kind, document) });
    const saved = await db.from(depositDocumentTable(kind)).update({ email_status: 'sent', emailed_at: new Date().toISOString(), email_error: null, delivery_claim_token: null, delivery_claimed_at: null })
      .eq('id', id).eq('email_status', 'sending').eq('delivery_claim_token', token).select('id').maybeSingle();
    if (saved.error || !saved.data) throw new Error('Delivery was confirmed, but its status needs a retry. The original delivery key will be checked.');
    return { status: 'sent' as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Document delivery failed. The cash record is saved.';
    const saved = await db.from(depositDocumentTable(kind)).update({ email_status: 'failed', email_error: message, delivery_claim_token: null })
      .eq('id', id).eq('email_status', 'sending').eq('delivery_claim_token', token);
    if (saved.error) throw new Error('The cash record is saved. Document delivery status needs a retry.');
    return { status: 'failed' as const, error: message };
  }
}

export async function retryDepositDocuments(limit = 4) {
  const db = createAdminClient();
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const due = `email_status.eq.pending,and(email_status.eq.failed,or(delivery_claimed_at.is.null,delivery_claimed_at.lt.${cutoff})),and(email_status.eq.sending,delivery_claimed_at.lt.${cutoff}),and(email_status.eq.not_required,pdf_path.is.null,or(delivery_claimed_at.is.null,delivery_claimed_at.lt.${cutoff}))`;
  const perKind = Math.max(1, Math.min(5, Math.ceil(limit / 2)));
  const [receipts, vouchers] = await Promise.all([
    db.from('deposit_receipts').select('id').or(due).order('delivery_claimed_at', { ascending: true, nullsFirst: true }).order('created_at').limit(perKind),
    db.from('payment_vouchers').select('id').or(due).order('delivery_claimed_at', { ascending: true, nullsFirst: true }).order('created_at').limit(perKind),
  ]);
  if (receipts.error || vouchers.error) throw new Error('Unable to load pending deposit documents.');
  let attempted = 0, sent = 0;
  const jobs: { kind: DepositDocumentKind; id: string }[] = [];
  for (let i = 0; i < perKind; i++) {
    if (receipts.data?.[i]) jobs.push({ kind: 'receipt', id: receipts.data[i].id });
    if (vouchers.data?.[i]) jobs.push({ kind: 'voucher', id: vouchers.data[i].id });
  }
  for (const job of jobs.slice(0, Math.max(1, limit))) {
    attempted++;
    try { if ((await deliverDepositDocument(job.kind, job.id)).status === 'sent') sent++; }
    catch { console.error('Deposit document remains queued', job); }
  }
  return { attempted, sent };
}
