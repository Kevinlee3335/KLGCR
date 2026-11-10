import {createHash} from 'node:crypto';
import {createAdminClient} from '@/lib/supabase/admin';
import {PaymentMailError} from './queries';
import {paymentSenderGroups} from './rules';

export const paymentConnectionFields = 'id,created_by,created_at,enabled_from,last_received_at,last_checked_at,last_error,revoked_at';
export type PaymentMailConnection = {
  id: string;
  created_by: string;
  created_at: string;
  enabled_from: string;
  last_received_at: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  revoked_at: string | null;
};
type PaymentMailDb = ReturnType<typeof createAdminClient>;

export function hashPaymentMailToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function authenticatePaymentMailImporter(db: PaymentMailDb, authorization: string | null): Promise<PaymentMailConnection> {
  const token = authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) throw new PaymentMailError('Invalid installation key', 401);
  const result = await db.from('payment_mail_connections').select(paymentConnectionFields)
    .eq('token_hash', hashPaymentMailToken(token)).is('revoked_at', null).maybeSingle();
  if (result.error) throw new PaymentMailError('Unable to check the email installation. Retry later.', 503);
  if (!result.data) throw new PaymentMailError('Invalid installation key', 401);
  const installer = await db.from('profiles').select('id').eq('id', result.data.created_by)
    .eq('role', 'admin').eq('is_active', true).is('deleted_at', null).maybeSingle();
  if (installer.error) throw new PaymentMailError('Unable to check the installation owner. Retry later.', 503);
  if (!installer.data) throw new PaymentMailError('Invalid installation key', 401);
  return result.data;
}

export async function loadPaymentMailSenders(db: PaymentMailDb) {
  const contacts = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await db.from('billing_payment_contacts').select('kind,account_key,email')
      .order('kind').order('account_key').range(offset, offset + 999);
    if (result.error) throw new PaymentMailError('Unable to load registered company emails', 503);
    contacts.push(...result.data);
    if (result.data.length < 1000) break;
  }
  return paymentSenderGroups(contacts);
}
