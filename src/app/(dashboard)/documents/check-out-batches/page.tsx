import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {CheckoutBatchHistory} from '@/components/checkout-batch-history';
import {requireRole} from '@/lib/auth';
export default async function Page(){const profile=await requireRole(['admin','management_viewer']);return <AppShell profile={profile} title="Check-out Batch Reports"><div className="section-head"><div><p className="eyebrow">Documents</p><h2>Check-out Batch Reports</h2><p className="subtle">Full details and A4 summaries, grouped by batch.</p></div><Link className="button secondary" href="/documents">All Documents</Link></div><CheckoutBatchHistory/></AppShell>;}
