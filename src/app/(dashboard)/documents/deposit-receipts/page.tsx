import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { GymDepositPanel } from '@/components/gym-deposit-panel';
import { requireRole } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export default async function DepositReceiptsPage() {
  const profile = await requireRole(['admin', 'management_viewer']);
  return <AppShell profile={profile} title="Deposit Receipts"><div className="section-head"><div><p className="eyebrow">DOCUMENTS</p><h2>Deposit Receipt List</h2></div><Link className="button secondary" href="/documents">Documents</Link></div><GymDepositPanel initialKind="receipts" readOnly={profile.role !== 'admin'}/></AppShell>;
}
