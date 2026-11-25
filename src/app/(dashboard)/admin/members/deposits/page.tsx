import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { GymDepositPanel } from '@/components/gym-deposit-panel';
import { requireRole } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export default async function GymDepositsPage() {
  const profile = await requireRole(['admin']);
  return <AppShell profile={profile} title="Gym Deposits"><div className="section-head"><div><p className="eyebrow">GYM MEMBERSHIP</p><h2>Cash deposits & refunds</h2></div><Link className="button secondary" href="/admin/members">Membership</Link></div><GymDepositPanel/></AppShell>;
}
