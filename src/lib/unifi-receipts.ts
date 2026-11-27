import { createHash } from 'node:crypto';
import { createAdminClient } from './supabase/admin';
import { matchUnifiReceipt, unifiReceiptDetails } from './unifi-receipt-details';
import { listUnifiInvoices } from './unifi-invoices';

export const unifiReceiptsPath = '/documents/unifi-receipts';
export const unifiReceiptBucket = 'unifi-payment-receipts';
export type UnifiReceiptAttachment = { name: string; mime_type: string; storage_path: string; size_bytes: number };
export type UnifiReceipt = ReturnType<typeof unifiReceiptDetails> & {
  id: string; source_message_id: string; source_aliases: string[]; source_folder: string; sender: string; subject: string;
  received_at: string; body_text: string; extracted_text?: string; invoice_id: string | null; match_method: 'auto' | 'manual' | null;
  email_path: string; attachments: UnifiReceiptAttachment[];
};
export async function listUnifiReceipts(): Promise<UnifiReceipt[]> {
  const db = createAdminClient();
  const rows: UnifiReceipt[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await db.from('unifi_payment_receipts').select('*').order('received_at', { ascending: false }).order('id').range(offset,offset+999);
    if (result.error) throw Error('Unable to load Unifi payment receipts.');
    rows.push(...result.data as UnifiReceipt[]);
    if (result.data.length < 1000) return rows;
  }
}
// The invoice register needs only the existence of a matched receipt for each invoice.
export async function listMatchedUnifiInvoiceIds(): Promise<Set<string>> {
  const db = createAdminClient();
  const ids = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('unifi_payment_receipts').select('invoice_id')
      .not('invoice_id', 'is', null).order('id').range(offset, offset + 999);
    if (error) throw Error('Unable to check matched Unifi receipts.');
    for (const row of data) ids.add(row.invoice_id);
    if (data.length < 1000) return ids;
  }
}

export async function getUnifiReceipt(id: string): Promise<UnifiReceipt | null> {
  const result = await createAdminClient().from('unifi_payment_receipts').select('*').eq('id',id).maybeSingle();
  if (result.error) throw Error('Unable to load the receipt.');
  return result.data as UnifiReceipt | null;
}
export async function storeUnifiReceipt(input: {
  source_message_id: string; source_folder: string; sender: string; subject: string; received_at: string; body_text: string; extracted_text: string;
  details: ReturnType<typeof unifiReceiptDetails>; source: Uint8Array;
  attachments: { name: string; mime_type: string; bytes: Uint8Array }[];
}) {
  const db = createAdminClient();
  const pdfHashes = input.attachments.filter(file=>file.mime_type==='application/pdf').map(file=>createHash('sha256').update(file.bytes).digest('hex')).sort().join('\n');
  const contentHash = createHash('sha256').update(pdfHashes || input.source).digest('hex');
  const previous = await db.from('unifi_payment_receipts').select('id,source_aliases').eq('content_hash',contentHash).maybeSingle();
  if (previous.error) throw Error('Unable to check existing receipts.');
  if (previous.data) {
    const aliases = [...new Set([...(previous.data.source_aliases || []) as string[],input.source_message_id])];
    const saved = await db.from('unifi_payment_receipts').update({source_aliases:aliases}).eq('id',previous.data.id);
    if (saved.error) throw Error('Unable to record a duplicate receipt email.');
    return false;
  }
  const bucket = db.storage.from(unifiReceiptBucket);
  const put = async (path: string, bytes: Uint8Array, contentType: string) => {
    const result = await bucket.upload(path,bytes,{contentType,upsert:false});
    if (result.error) {
      const existing = await bucket.download(path);
      if (!existing.data || existing.error || createHash('sha256').update(Buffer.from(await existing.data.arrayBuffer())).digest('hex')
        !== createHash('sha256').update(bytes).digest('hex')) throw Error('Unable to archive a receipt file.');
    }
  };
  const emailPath = `emails/${createHash('sha256').update(input.source).digest('hex')}.eml`;
  await put(emailPath,input.source,'message/rfc822');
  const attachments: UnifiReceiptAttachment[] = [];
  for (const item of input.attachments) {
    const extension = item.mime_type === 'application/pdf' ? 'pdf' : item.mime_type === 'image/png' ? 'png' : 'jpg';
    const path = `attachments/${createHash('sha256').update(item.bytes).digest('hex')}.${extension}`;
    await put(path,item.bytes,item.mime_type);
    attachments.push({name:item.name,mime_type:item.mime_type,storage_path:path,size_bytes:item.bytes.length});
  }
  const invoiceId = matchUnifiReceipt(input.details,await listUnifiInvoices());
  const { source, details, attachments: files, ...mail } = input;
  void source; void files;
  const saved = await db.from('unifi_payment_receipts').insert({ ...mail, ...details, content_hash:contentHash,
    email_path:emailPath,attachments,invoice_id:invoiceId,match_method:invoiceId?'auto':null,matched_at:invoiceId?new Date().toISOString():null });
  if (saved.error && saved.error.code !== '23505') throw Error('Unable to save the receipt record.');
  return !saved.error;
}
export async function matchUnifiReceiptToInvoice(receiptId: string, invoiceId: string, actorId: string) {
  const db = createAdminClient();
  const [receipt, invoices] = await Promise.all([getUnifiReceipt(receiptId),listUnifiInvoices()]);
  const invoice = invoices.find(item=>item.id===invoiceId);
  if (!receipt || !invoice || (receipt.account_number && receipt.account_number !== invoice.account_number)) throw Error('The receipt account does not match this invoice.');
  if (!receipt.confirmed) throw Error('This email does not confirm a completed payment.');
  if (receipt.invoice_id) throw Error('This receipt is already linked.');
  const result = await db.from('unifi_payment_receipts').update({invoice_id:invoiceId,match_method:'manual',matched_at:new Date().toISOString(),matched_by:actorId})
    .eq('id',receiptId).is('invoice_id',null).select('id').maybeSingle();
  if (result.error || !result.data) throw Error('Unable to link this receipt. Refresh and try again.');
}

export async function rematchUnifiReceipts() {
  const [receipts,invoices] = await Promise.all([listUnifiReceipts(),listUnifiInvoices()]);
  for (const receipt of receipts) {
    const details = receipt.extracted_text ? unifiReceiptDetails(receipt.extracted_text) : receipt;
    const invoiceId = receipt.invoice_id || matchUnifiReceipt(details,invoices);
    const match = !receipt.invoice_id && invoiceId ? {invoice_id:invoiceId,match_method:'auto',matched_at:new Date().toISOString()} : {};
    let update = createAdminClient().from('unifi_payment_receipts').update({account_number:details.account_number,payment_date:details.payment_date,amount:details.amount,receipt_number:details.receipt_number,invoice_references:details.invoice_references,confirmed:details.confirmed,...match})
      .eq('id',receipt.id);
    if (!receipt.invoice_id) update = update.is('invoice_id',null);
    const result = await update;
    if (result.error) throw Error('Unable to match archived Unifi receipts.');
  }
}
