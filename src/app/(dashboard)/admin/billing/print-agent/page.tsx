import '../billing.css';
import {requireRole} from '@/lib/auth';
import {AppShell} from '@/components/app-shell';
import {PrintAgentPanel} from '@/components/print-agent-panel';
export default async function Page(){const profile=await requireRole(['admin','management_viewer']);return <AppShell profile={profile} title="Rental & Utilities"><PrintAgentPanel/></AppShell>}
