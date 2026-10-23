import {AppShell} from '@/components/app-shell';
import {QuotationPanel} from '@/components/quotation-panel';
import {requireRole} from '@/lib/auth';
import '../billing/billing.css';
export default async function Page(){const profile=await requireRole(['admin','management_viewer']);return <AppShell profile={profile} title="Quotations"><QuotationPanel/></AppShell>}
