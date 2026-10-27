import {AppShell} from '@/components/app-shell';
import {OfficeUsageSection} from '@/components/office-usage-section';
import {requireRole} from '@/lib/auth';
export default async function OfficeSupplies({searchParams}:{searchParams:Promise<{usagePage?:string;usageQ?:string}>}){
 const profile=await requireRole(['admin','maintenance_staff','cleaner','management_viewer']),query=await searchParams;
 return <AppShell profile={profile} title="Office Inventory"><div className="section-head"><div><p className="eyebrow">Office Inventory</p><h2>Office Supplies</h2><p className="subtle">Record supplies taken and view usage history.</p></div>{profile.role==='admin'&&<a className="button secondary-button" href="/admin/inventory?store=office">Manage Stock</a>}</div><OfficeUsageSection profile={profile} page={query.usagePage} search={query.usageQ}/></AppShell>;
}
