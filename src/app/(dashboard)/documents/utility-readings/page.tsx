import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {BillingMeterPhotos} from '@/components/billing-meter-photos';
import {requireRole} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {configSchema,monthSchema} from '@/lib/billing-preview';
import {orderedUtilityAccounts} from '@/lib/billing-account-order';
import {ensureUtilityMonth} from '@/lib/utility-months';
import '../../admin/billing/billing.css';

export default async function ReadingHistory({searchParams}:{searchParams:Promise<{month?:string;account?:string}>}){
 const profile=await requireRole(['admin','management_viewer']);
 await ensureUtilityMonth();
 const db=await createClient();const search=await searchParams;
 const {data:months,error}=await db.from('utility_reading_months').select('period,saved_at').order('period',{ascending:false});
 if(error)throw Error('Unable to load utility reading history');
 const month=monthSchema.safeParse(search.month).success?search.month!:months?.[0]?.period;
 const saved=month?await db.from('utility_reading_months').select('config').eq('period',month).single():null;
 if(saved?.error)throw Error('Unable to load saved readings');
 const config=saved?.data?configSchema.parse(saved.data.config):null;
 const accounts=config?orderedUtilityAccounts(config.utilityAccounts):[];
 const account=accounts.find(a=>a.id===search.account);
 return <AppShell profile={profile} title="Utility reading history"><div className="billing-module billing-reading-history">
  <div className="billing-hero"><div><span className="billing-eyebrow">K HOTEL SDN BHD · DOCUMENTS</span><h2>Meter photos & readings</h2><p>Monthly records save automatically. Missing readings remain pending for review.</p></div></div>
  <div className="billing-toolbar"><Link href="/documents">Documents</Link><Link href="/admin/billing">Manage utilities</Link></div>
  <nav className="billing-tabs" aria-label="Billing months">{months?.map(m=><a key={m.period} aria-current={month===m.period?'page':undefined} href={'/documents/utility-readings?'+new URLSearchParams({month:m.period})}>{m.period}</a>)}</nav>
  {accounts.map(a=><article className="billing-card" key={a.id}><div className="billing-account-heading"><h3>{a.name}</h3><a className="billing-history-open" href={'/documents/utility-readings?'+new URLSearchParams({month:month!,account:a.id})}>View saved readings</a></div>
   {account?.id===a.id&&<div className="billing-meters">{a.meters.map(m=><div className="billing-meter" key={m.id}><b>{m.label} · {m.unit}</b><small>{m.serial}</small><p>Previous: {m.prev??'Missing — review required'} · Current: {m.curr??'Pending'} · {m.confirmed?'Confirmed':'Awaiting confirmation'}</p><BillingMeterPhotos label={m.label} previousPhoto={m.previousPhoto} photo={m.photo} previousDate={m.previousDate||''} currentDate={m.currentDate||month!+'-01'} previous={m.prev} current={m.curr}/></div>)}</div>}
  </article>)}
  {!months?.length&&<p>No readings saved yet.</p>}
 </div></AppShell>;
}
