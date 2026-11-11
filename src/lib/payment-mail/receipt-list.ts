import {createAdminClient} from '@/lib/supabase/admin';
import {PaymentMailError, requirePaymentMailAdmin} from './queries';
import {receiptListPageSize, type ReceiptListItem, type ReceiptListResult} from './types';

type ProfileName = {full_name: string};
type ReceiptRow = Omit<ReceiptListItem, 'verifier_name' | 'amount'> & {
  amount: string | number;
  issuer: ProfileName | null;
  verification: {verifier: ProfileName | null} | null;
};

export async function loadReceiptList({page, q}: {page: number; q: string}): Promise<ReceiptListResult> {
  await requirePaymentMailAdmin();
  let query = createAdminClient().from('official_receipts').select(`
    id,receipt_no,payer,amount,description,paid_on,
    issuer:profiles!official_receipts_created_by_fkey(full_name),
    verification:payment_mail_messages!payment_mail_messages_receipt_id_fkey(
      verifier:profiles!payment_mail_messages_verified_by_fkey(full_name)
    )
  `, {count: 'exact'}).in('kind', ['rental', 'utility', 'billing']);
  if (q) {
    // Treat the input literally in PostgreSQL's regex and in the enclosing PostgREST filter.
    const literal = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filterValue = `"${literal.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    query = query.or(`receipt_no.imatch.${filterValue},payer.imatch.${filterValue}`);
  }
  const offset = (page - 1) * receiptListPageSize;
  const result = await query.order('created_at', {ascending: false}).order('id', {ascending: false})
    .range(offset, offset + receiptListPageSize - 1);
  if (result.error) throw new PaymentMailError('Unable to load the Receipt List. Please try again.', 503);

  const rows = (result.data || []) as unknown as ReceiptRow[];
  return {
    items: rows.map(({issuer, verification, amount, ...receipt}) => ({
      ...receipt,
      amount: Number(amount),
      verifier_name: verification?.verifier?.full_name ?? issuer?.full_name ?? null,
    })),
    total: result.count ?? 0,
  };
}
