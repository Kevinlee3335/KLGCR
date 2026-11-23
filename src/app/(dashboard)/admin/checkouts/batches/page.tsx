import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {CheckoutBatchHistory} from '@/components/checkout-batch-history';
import {requireRole} from '@/lib/auth';
export default async function Page(){const profile=await requireRole(['admin','management_viewer']);return <AppShell profile={profile} title="Check-out Batch History"><div className="section-head"><div><p className="eyebrow">Check-out Rooms</p><h2>Batch History</h2><p className="subtle">Open any batch to review its rooms, work, materials and original reports.</p></div><Link className="button secondary" href="/admin/checkouts">Current Dashboard</Link></div><CheckoutBatchHistory/></AppShell>;}
