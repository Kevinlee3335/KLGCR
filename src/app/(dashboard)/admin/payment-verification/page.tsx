import { AppShell } from '@/components/app-shell';
import { PaymentMailVerification } from '@/components/payment-mail-verification';
import { loadPaymentMailList, PaymentMailError } from '@/lib/payment-mail/queries';
import { requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function PaymentVerificationPage({ searchParams }: {
  searchParams: Promise<{ id?: string }>;
}) {
  const [profile, query] = await Promise.all([requireRole(['admin']), searchParams]);
  const initialInbox = loadPaymentMailList({ status: 'pending', limit: 50, offset: 0 }).then(
    data => ({ data, error: '', checkedAt: new Date().toISOString() }),
    error => ({ data: null, error: error instanceof PaymentMailError ? error.message : 'Unable to load payment emails. Please retry.', checkedAt: '' }),
  );
  return <AppShell profile={profile} title="Payment Verification">
    <PaymentMailVerification initialInbox={initialInbox} initialId={typeof query.id === 'string' ? query.id : undefined} />
  </AppShell>;
}
