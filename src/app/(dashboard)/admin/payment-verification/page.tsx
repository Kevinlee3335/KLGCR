import { AppShell } from '@/components/app-shell';
import { PaymentMailVerification } from '@/components/payment-mail-verification';
import { requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function PaymentVerificationPage({ searchParams }: {
  searchParams: Promise<{ id?: string }>;
}) {
  const [profile, query] = await Promise.all([requireRole(['admin']), searchParams]);
  return <AppShell profile={profile} title="Payment Verification">
    <PaymentMailVerification initialId={typeof query.id === 'string' ? query.id : undefined} />
  </AppShell>;
}
