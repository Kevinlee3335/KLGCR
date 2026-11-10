import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {emailOfficialReceipt} from '@/lib/finance-mail';
import type {OfficialReceipt} from '@/lib/official-receipt';
import {loadPaymentMailItem, PaymentMailError} from './queries';
import type {PaymentMailMutationResult, VerifyPaymentMailInput} from './types';

const money = z.number().finite().positive().max(1_000_000_000)
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001, 'Use at most two decimal places');

export const paymentMailActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('verify'), id: z.string().uuid(), companyKey: z.string().trim().toLowerCase().email().max(254),
    paidOn: z.string().date(), bankReference: z.string().trim().max(200), amount: money,
    bankReceived: z.literal(true), companyConfirmed: z.literal(true), proofId: z.string().uuid(),
    allocations: z.array(z.object({run_id: z.string().uuid(), line_index: z.number().int().min(0).max(2_147_483_647), amount: money}).strict()).min(1).max(120),
  }).strict(),
  z.object({action: z.literal('reject'), id: z.string().uuid(), reason: z.string().trim().min(1).max(2000)}).strict(),
  z.object({action: z.literal('resend'), id: z.string().uuid()}).strict(),
]);

async function sendAndReloadReceipt(receipt: OfficialReceipt): Promise<{receipt: OfficialReceipt; mail: 'sent' | 'pending'}> {
  // The immutable Receipt ID is also the gateway delivery key. A timeout/retry never makes a new Receipt.
  if (receipt.emailed_at) return {receipt, mail: 'sent'};
  try { await emailOfficialReceipt(receipt); } catch { /* The finance helper retains the pending error on this Receipt. */ }
  const saved = await createAdminClient().from('official_receipts').select('*').eq('id', receipt.id).single();
  if (saved.error) throw new PaymentMailError('Payment is recorded, but the Receipt email status could not be refreshed. Open it again before retrying.', 503);
  return {receipt: saved.data, mail: saved.data.emailed_at ? 'sent' : 'pending'};
}

export async function verifyPaymentMail(actorId: string, input: VerifyPaymentMailInput): Promise<PaymentMailMutationResult> {
  const result = await createAdminClient().rpc('verify_payment_mail', {
    p_id: input.id, p_actor: actorId, p_company_key: input.companyKey, p_date: input.paidOn,
    p_amount: input.amount, p_reference: input.bankReference, p_proof_id: input.proofId,
    p_allocations: input.allocations, p_bank_received: input.bankReceived, p_company_confirmed: input.companyConfirmed,
  });
  if (result.error) {
    if (result.error.code === 'P0001') throw new PaymentMailError(result.error.message, 409);
    throw new PaymentMailError('Unable to verify payment. Refresh before trying again.', 503);
  }
  if (!result.data?.id) throw new PaymentMailError('No Receipt was returned. Refresh before retrying.', 503);
  const delivery = await sendAndReloadReceipt(result.data as OfficialReceipt);
  return {ok: true, item: await loadPaymentMailItem(input.id), ...delivery};
}

export async function rejectPaymentMail(actorId: string, id: string, reason: string): Promise<PaymentMailMutationResult> {
  const result = await createAdminClient().rpc('reject_payment_mail', {p_id: id, p_actor: actorId, p_reason: reason});
  if (result.error) {
    if (result.error.code === 'P0001') throw new PaymentMailError(result.error.message, 409);
    throw new PaymentMailError('Unable to reject the payment email. Refresh before trying again.', 503);
  }
  return {ok: true, item: await loadPaymentMailItem(id)};
}

export async function resendPaymentMailReceipt(id: string): Promise<PaymentMailMutationResult> {
  const item = await loadPaymentMailItem(id);
  if (item.status !== 'verified' || !item.receipt_id) throw new PaymentMailError('Verify this payment before sending a Receipt', 409);
  const result = await createAdminClient().from('official_receipts').select('*').eq('id', item.receipt_id).single();
  if (result.error) throw new PaymentMailError('Unable to load the issued Receipt', 503);
  return {ok: true, item, ...await sendAndReloadReceipt(result.data)};
}
