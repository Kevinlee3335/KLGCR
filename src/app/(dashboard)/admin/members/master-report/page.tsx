import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {requireRole} from '@/lib/auth';
import {membershipEnabled} from '@/lib/membership';
import {loadMembershipMaster} from '@/lib/membership-master-data';
import {renderMembershipMaster} from '@/lib/membership-master';
export const dynamic='force-dynamic';
export default async function MasterReportPage({searchParams}:{searchParams:Promise<{sheet?:string;months?:string}>}){
 const profile=await requireRole(['admin']);
 if(!membershipEnabled())return <AppShell profile={profile} title="Membership Master Report"><p>Membership is not enabled.</p></AppShell>;
 const search=await searchParams;
 let loaded;try{loaded=await loadMembershipMaster();}catch{return <AppShell profile={profile} title="Membership Master Report"><p className="error">Unable to load the report. Please refresh.</p></AppShell>;}
 const {result}=loaded,index=Math.max(0,Math.min(result.layout.sheets.length-1,Math.trunc(Number(search.sheet)||0))),all=search.months==='all';
 return <AppShell profile={profile} title="Membership Master Report"><div className="section-head"><div><p className="eyebrow">ORIGINAL EXCEL FORMAT</p><h2>Membership Master Report</h2><p className="subtle">Approved registration and renewal fees fill their membership month automatically. RM10 deposits are excluded.</p></div><div className="actions"><Link className="button secondary" href="/admin/members">Membership</Link><a className="button" href="/admin/members/master-report/download">Download Excel</a></div></div>
 <section className="panel"><nav className="actions" aria-label="Original workbook sheets">{result.layout.sheets.map((sheet,i)=><Link className={`button${index===i?'':' secondary'}`} key={sheet.name} href={`?sheet=${i}${all?'&months=all':''}`} aria-current={index===i?'page':undefined}>{sheet.name}</Link>)}</nav><p className="subtle">{result.layout.sheets[index].name} · Historical entries and colours are retained. Current system updates appear in SPORT CLUB - 2026.</p><Link className="text-link" href={`?sheet=${index}${all?'':'&months=all'}`}>{all?'Use original hidden rows / columns':'Show hidden rows / months'}</Link>
 {result.warnings.length>0&&<details style={{margin:'12px 0'}}><summary>Source workbook notes ({result.warnings.length})</summary>{result.warnings.map((w,i)=><p className="subtle" key={i}>{w}</p>)}</details>}
 <div style={{overflow:'auto',maxHeight:'74vh',marginTop:12,border:'1px solid #d9d9d9'}} dangerouslySetInnerHTML={{__html:renderMembershipMaster(result,index,all)}}/>
 <style>{`.master-excel{border-collapse:collapse;table-layout:fixed;width:max-content;background:white;color:black}.master-excel td{padding:0 2px;box-sizing:border-box;overflow:hidden;min-width:0}.master-excel tr:nth-child(-n+4){position:relative}`}</style>
 </section></AppShell>;
}
