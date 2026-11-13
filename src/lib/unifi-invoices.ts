import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { documentReviewers } from './document-review-status';
import { createAdminClient } from './supabase/admin';

export const unifiInvoicePath = '/admin/unifi-invoices';
export const unifiPendingStages = ['fikri', 'kevin', 'james'] as const;
export const unifiReviewerForStage = {
  fikri: documentReviewers[0],
  kevin: documentReviewers[1],
  james: documentReviewers[2],
} as const;
export type UnifiPendingStage = typeof unifiPendingStages[number];
export type UnifiInvoiceStage = UnifiPendingStage | 'approved';

export type UnifiInvoice = {
  id: string;
  period: string;
  source: 'manual' | 'webmail';
  source_message_id: string | null;
  invoice_number: string | null;
  account_number: string | null;
  line_number: number | null;
  received_at: string | null;
  due_date: string | null;
  file_name: string;
  review_stage: UnifiInvoiceStage;
  created_at: string;
  fikri_verified_at: string | null;
  kevin_verified_at: string | null;
  james_approved_at: string | null;
};

type UnifiInvoiceInput = {
  period: string;
  source: UnifiInvoice['source'];
  sourceMessageId?: string;
  invoiceNumber?: string;
  accountNumber?: string;
  receivedAt?: string;
  dueDate?: string;
  fileName: string;
  bytes: Uint8Array;
  createdBy?: string;
};

const invoiceFields = 'id,period,source,source_message_id,invoice_number,account_number,received_at,due_date,file_name,review_stage,created_at,fikri_verified_at,kevin_verified_at,james_approved_at';
const bucketName = 'unifi-invoices';
const maximumPageSize = 12 * 1024 * 1024;
type AdminClient = ReturnType<typeof createAdminClient>;

async function matchingInvoice(db: AdminClient, period: string, contentHash: string, invoiceNumber: string | null) {
  const byHash = await db.from('unifi_invoices').select('id,period').eq('content_hash', contentHash).maybeSingle();
  if (byHash.error) throw Error('Unable to check existing TM Unifi invoices.');
  if (byHash.data) {
    if (byHash.data.period !== period) throw Error('This PDF is already filed under a different invoice month.');
    return byHash.data;
  }
  if (!invoiceNumber) return null;
  const byNumber = await db.from('unifi_invoices').select('id,period')
    .eq('period', period).eq('invoice_number', invoiceNumber).maybeSingle();
  if (byNumber.error) throw Error('Unable to check existing TM Unifi invoices.');
  return byNumber.data;
}

export async function storeUnifiInvoice(input: UnifiInvoiceInput): Promise<{ id: string; created: boolean }> {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(input.period) || input.period < '2026-09') {
    throw Error('Enter an invoice month from September 2026 onward.');
  }
  const fileName = input.fileName.trim();
  const sourceMessageId = input.sourceMessageId?.trim() || null;
  const invoiceNumber = input.invoiceNumber?.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase() || null;
  if (!fileName || fileName.length > 255 || /[\x00-\x1f\x7f]/.test(fileName)
    || (sourceMessageId && (sourceMessageId.length > 998 || /[\x00-\x1f\x7f]/.test(sourceMessageId)))
    || (invoiceNumber && (invoiceNumber.length > 120 || /[\x00-\x1f\x7f]/.test(invoiceNumber)))) {
    throw Error('The invoice file name or reference is invalid.');
  }
  const bytes = Buffer.from(input.bytes);
  if (!bytes.length || bytes.length > maximumPageSize || bytes.subarray(0, 5).toString() !== '%PDF-') {
    throw Error('The invoice first page must be a valid PDF up to 12 MB.');
  }
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false }).catch(() => null);
  if (pdf?.getPageCount() !== 1) throw Error('Only the first page of the invoice may be stored.');

  const db = createAdminClient();
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  const previous = await matchingInvoice(db, input.period, contentHash, invoiceNumber);
  if (previous) return { id: previous.id, created: false };

  const bucket = db.storage.from(bucketName);
  const storagePath = contentHash + '.pdf';
  const uploaded = await bucket.upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false });
  if (uploaded.error) {
    // A retry or a concurrent import can find the same content-addressed PDF.
    const existing = await bucket.download(storagePath);
    if (existing.error || !existing.data || existing.data.size !== bytes.length
      || createHash('sha256').update(Buffer.from(await existing.data.arrayBuffer())).digest('hex') !== contentHash) {
      throw Error('Unable to store the TM Unifi invoice first page.');
    }
  }

  const saved = await db.from('unifi_invoices').insert({
    period: input.period,
    source: input.source,
    source_message_id: sourceMessageId,
    invoice_number: invoiceNumber,
    account_number: input.accountNumber ?? null,
    received_at: input.receivedAt ?? null,
    due_date: input.dueDate ?? null,
    file_name: fileName,
    content_hash: contentHash,
    size_bytes: bytes.length,
    created_by: input.createdBy ?? null,
  }).select('id').single();
  if (!saved.error && saved.data) return { id: saved.data.id, created: true };
  if (saved.error?.code === '23505') {
    const concurrent = await matchingInvoice(db, input.period, contentHash, invoiceNumber);
    if (concurrent) return { id: concurrent.id, created: false };
  }
  throw Error('Unable to save the TM Unifi invoice.');
}

async function unifiAccountLines(db: AdminClient) {
  const result = await db.from('unifi_accounts').select('account_number,line_number');
  if (result.error) throw Error('Unable to load TM Unifi lines.');
  return new Map(result.data.map(row => [row.account_number as string, row.line_number as number]));
}

export async function listUnifiInvoices(stage?: UnifiInvoiceStage): Promise<UnifiInvoice[]> {
  const db = createAdminClient();
  const query = db.from('unifi_invoices').select(invoiceFields)
    .order('period', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false });
  const [result, lines] = await Promise.all([stage ? query.eq('review_stage', stage) : query, unifiAccountLines(db)]);
  if (result.error) throw Error('Unable to load TM Unifi invoices.');
  return result.data.map(row => ({ ...row, line_number: lines.get(row.account_number ?? '') ?? null })) as UnifiInvoice[];
}

export async function getUnifiInvoice(id: string): Promise<UnifiInvoice | null> {
  const db = createAdminClient();
  const [result, lines] = await Promise.all([
    db.from('unifi_invoices').select(invoiceFields).eq('id', id).maybeSingle(),
    unifiAccountLines(db),
  ]);
  if (result.error) throw Error('Unable to load the TM Unifi invoice.');
  return result.data ? { ...result.data, line_number: lines.get(result.data.account_number ?? '') ?? null } as UnifiInvoice : null;
}

export async function downloadUnifiInvoice(id: string): Promise<{ bytes: Uint8Array; fileName: string } | null> {
  const db = createAdminClient();
  const invoice = await db.from('unifi_invoices').select('file_name,content_hash').eq('id', id).maybeSingle();
  if (invoice.error) throw Error('Unable to load the TM Unifi invoice.');
  if (!invoice.data) return null;
  const { data, error } = await db.storage.from(bucketName).download(invoice.data.content_hash + '.pdf');
  if (error || !data) throw Error('Unable to read the TM Unifi invoice PDF.');
  return { bytes: new Uint8Array(await data.arrayBuffer()), fileName: invoice.data.file_name };
}

export async function advanceUnifiInvoiceReview(id: string, expectedStage: UnifiPendingStage, actorId: string): Promise<UnifiInvoiceStage> {
  const result = await createAdminClient().rpc('advance_unifi_invoice_review', {
    p_invoice_id: id,
    p_expected_stage: expectedStage,
    p_actor_id: actorId,
  });
  if (result.error || !result.data) throw Error('Unable to save this review. Refresh and check the current reviewer.');
  return result.data as UnifiInvoiceStage;
}
