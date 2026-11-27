import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { signatureSchema } from '@/lib/purchase-orders/signature';
import {gymDepositStartDate, newGymDepositsAvailable} from '@/lib/gym-deposit-availability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const filters = z.object({
  member: z.string().uuid().optional(), activeOnly: z.literal('1').optional(), kind: z.enum(['receipts', 'vouchers']).default('receipts'),
  q: z.string().max(100).default(''), status: z.enum(['held', 'refunded']).optional(),
  from: z.string().date().optional(), to: z.string().date().optional(), page: z.coerce.number().int().min(1).max(100000).default(1),
});
const receiptColumns = 'id,receipt_no,source_module,member_id,payer,email,member_reference,amount,received_on,received_by_name,origin,original_receipt_no,note,status,created_at,pdf_path,pdf_error,email_status,email_error,emailed_at,payment_vouchers(id,voucher_no)';
const voucherColumns = 'id,voucher_no,source_module,member_id,origin,deposit_receipt_id,payer,email,member_reference,amount,paid_on,refunded_by_name,created_at,pdf_path,pdf_error,email_status,email_error,emailed_at,deposit_receipts(receipt_no)';

export async function GET(request: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile || !['admin', 'management_viewer'].includes(profile.role)) return json({ error: 'Access denied.' }, 403);
  const parsed = filters.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return json({ error: 'Invalid search filters.' }, 400);
  const f = parsed.data;
  if (f.from && f.to && f.from > f.to) return json({ error: 'The start date must be before the end date.' }, 400);
  const q = f.q.replace(/[^\p{L}\p{N}@.\s_-]/gu, '').trim();
  const db = createAdminClient();
  const countReceipts = f.activeOnly === '1' && f.kind === 'vouchers';
  const countVouchers = f.activeOnly === '1' && f.kind === 'receipts';
  let receipts = db.from('deposit_receipts').select(receiptColumns, { count: 'exact', head: countReceipts }).eq('source_module', 'gym').order('received_on', { ascending: false }).order('created_at', { ascending: false }).order('id');
  let vouchers = db.from('payment_vouchers').select(voucherColumns, { count: 'exact', head: countVouchers }).eq('source_module', 'gym').order('paid_on', { ascending: false }).order('created_at', { ascending: false }).order('id');
  if (f.member) { receipts = receipts.eq('member_id', f.member); vouchers = vouchers.eq('member_id', f.member); }
  if (f.status) receipts = receipts.eq('status', f.status);
  if (f.from) { receipts = receipts.gte('received_on', f.from); vouchers = vouchers.gte('paid_on', f.from); }
  if (f.to) { receipts = receipts.lte('received_on', f.to); vouchers = vouchers.lte('paid_on', f.to); }
  if (q) {
    receipts = receipts.or(`payer.ilike.%${q}%,receipt_no.ilike.%${q}%,member_reference.ilike.%${q}%`);
    vouchers = vouchers.or(`payer.ilike.%${q}%,voucher_no.ilike.%${q}%,member_reference.ilike.%${q}%`);
  }
  const offset = (f.page - 1) * 25;
  try {
    const [receiptRows, voucherRows, summary, signature, held, history, legacy] = await Promise.all([
      countReceipts ? receipts.limit(1) : receipts.range(offset, offset + 24),
      countVouchers ? vouchers.limit(1) : vouchers.range(offset, offset + 24),
      db.rpc('get_deposit_document_summary'),
      profile.role === 'admin' ? db.from('user_e_signatures').select('signature').eq('user_id', profile.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      f.member ? db.from('deposit_receipts').select('id', { count: 'exact', head: true }).eq('source_module', 'gym').eq('member_id', f.member).eq('status', 'held') : Promise.resolve({ count: 0, error: null }),
      f.member ? db.from('deposit_receipts').select('id', { count: 'exact', head: true }).eq('source_module', 'gym').eq('member_id', f.member) : Promise.resolve({ count: 0, error: null }),
      f.member ? db.from('payment_vouchers').select('id', { count: 'exact', head: true }).eq('source_module', 'gym').eq('member_id', f.member).eq('origin', 'legacy_refund') : Promise.resolve({ count: 0, error: null }),
    ]);
    if (receiptRows.error || voucherRows.error || summary.error || signature.error || held.error || history.error || legacy.error) throw new Error('Unable to load deposit records. Please refresh and try again.');
    const publicReceiptRows = (receiptRows.data || []).map(({ pdf_path, payment_vouchers, ...row }) => {
      const related = payment_vouchers as unknown as {id:string;voucher_no:string} | {id:string;voucher_no:string}[] | null;
      const linked = Array.isArray(related) ? related[0] : related;
      return { ...row, pdf_ready: Boolean(pdf_path), voucher_id: linked?.id || null, voucher_no: linked?.voucher_no || null };
    });
    const publicVoucherRows = (voucherRows.data || []).map(({ pdf_path, deposit_receipts, ...row }) => {
      const relation = deposit_receipts as unknown as { receipt_no: string } | { receipt_no: string }[] | null;
      const original = Array.isArray(relation) ? relation[0] : relation;
      return { ...row, original_receipt_no: original?.receipt_no || null, pdf_ready: Boolean(pdf_path) };
    });
    return json({ receipts: publicReceiptRows, vouchers: publicVoucherRows, receiptCount: receiptRows.count || 0, voucherCount: voucherRows.count || 0,
      summary: summary.data, canManage: profile.role === 'admin', actorName: profile.full_name,
      signatureReady: profile.role === 'admin' && signatureSchema.safeParse(signature.data?.signature).success,
      newDepositsAvailable: newGymDepositsAvailable(), depositStartDate: gymDepositStartDate,
      ...(f.member ? { memberHasHeldDeposit: Boolean(held.count), hasDepositHistory: Boolean(history.count), legacyRefunded: Boolean(legacy.count) } : {}),
    });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Unable to load deposit records.' }, 503); }
}

const receive = z.object({ action: z.literal('receive'), request_id: z.string().uuid(), member_id: z.string().uuid(), received_on: z.string().date(),
  origin: z.enum(['received', 'existing']).default('received'), original_receipt_no: z.string().trim().max(100).default(''), note: z.string().trim().max(1000).default(''),
}).strict();
const refund = z.object({ action: z.literal('refund'), request_id: z.string().uuid(), deposit_id: z.string().uuid() }).strict();
const legacyRefund = z.object({action: z.literal('refund_legacy'), request_id: z.string().uuid(), member_id: z.string().uuid()}).strict();
const retry = z.object({ action: z.enum(['resend', 'retry_pdf']), document_kind: z.enum(['receipt', 'voucher']), id: z.string().uuid() }).strict();

function scheduleDelivery(kind: 'receipt' | 'voucher', id: string) {
  after(async () => {
    try {
      const { deliverDepositDocument } = await import('@/lib/deposit-documents');
      await deliverDepositDocument(kind, id);
    }
    catch { console.error('Deposit document remains queued for retry', { kind, id }); }
  });
}

export async function POST(request: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== 'admin') return json({ error: 'Admin permission required.' }, 403);
  if (request.headers.get('origin') !== request.nextUrl.origin) return json({ error: 'Invalid origin.' }, 403);
  const raw = await request.text();
  if (raw.length > 6000) return json({ error: 'The request is too large.' }, 413);
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
  const receiveInput = receive.safeParse(input), refundInput = refund.safeParse(input), legacyInput = legacyRefund.safeParse(input), retryInput = retry.safeParse(input);
  if (!receiveInput.success && !refundInput.success && !legacyInput.success && !retryInput.success) return json({ error: 'Check the deposit details and try again.' }, 400);
  if (receiveInput.success && receiveInput.data.origin === 'received' && (!newGymDepositsAvailable() || receiveInput.data.received_on < gymDepositStartDate)) return json({error: 'New cash deposit receipts start on 1 December 2026.', available_from: gymDepositStartDate}, 409);
  try {
    const db = createAdminClient();
    if (receiveInput.success) {
      const v = receiveInput.data;
      const { data, error } = await db.rpc('record_gym_deposit', { p_id: v.request_id, p_member: v.member_id, p_actor: profile.id,
        p_received_on: v.received_on, p_origin: v.origin, p_original_receipt_no: v.original_receipt_no, p_note: v.note });
      if (error) return json({ error: error.message }, /already|identifier/i.test(error.message) ? 409 : 400);
      scheduleDelivery('receipt', data.id);
      return json({ ok: true, id: data.id, document_kind: 'receipt', receipt_no: data.receipt_no, mail: data.email_status });
    }
    if (refundInput.success) {
      const v = refundInput.data;
      const { data, error } = await db.rpc('refund_gym_deposit', { p_id: v.request_id, p_deposit: v.deposit_id, p_actor: profile.id });
      if (error) return json({ error: error.message }, /already|identifier/i.test(error.message) ? 409 : 400);
      scheduleDelivery('voucher', data.id);
      return json({ ok: true, id: data.id, document_kind: 'voucher', voucher_no: data.voucher_no, mail: data.email_status,
        already_refunded: data.id !== v.request_id, refunded_by_name: data.refunded_by_name });
    }
    if (legacyInput.success) {
      const v = legacyInput.data;
      const {data, error} = await db.rpc('refund_legacy_gym_deposit', {p_id: v.request_id, p_member: v.member_id, p_actor: profile.id});
      if (error) return json({error: error.message}, /already|identifier|recorded|tracked/i.test(error.message) ? 409 : 400);
      scheduleDelivery('voucher', data.id);
      return json({ok: true, id: data.id, document_kind: 'voucher', voucher_no: data.voucher_no, mail: data.email_status,
        already_refunded: data.id !== v.request_id, refunded_by_name: data.refunded_by_name});
    }
    const v = retryInput.data!;
    const { loadDepositDocument, ensureDepositDocumentPdf } = await import('@/lib/deposit-documents');
    const document = await loadDepositDocument(v.document_kind, v.id);
    if (document.source_module !== 'gym') return json({ error: 'Document not found.' }, 404);
    if (v.action === 'retry_pdf') await ensureDepositDocumentPdf(v.document_kind, document);
    scheduleDelivery(v.document_kind, v.id);
    return json({ ok: true, id: v.id, document_kind: v.document_kind, mail: document.email_status });
  } catch { return json({ error: 'Unable to complete this request. Refresh the record before trying again; a saved cash transaction will not be duplicated.' }, 503); }
}
