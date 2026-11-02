import {documentVerification,documentReviewers} from '@/lib/document-review';
import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {requireRole} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {BILLING_APPROVER_ID} from '@/lib/billing-approval';

export default async function Page(){
 const profile=await requireRole(['admin']);
 const result=await createAdminClient().from('gym_monthly_approvals').select('id,month,kind,approved_at,sent_at,snapshot').order('month',{ascending:false});
 if(result.error)throw Error('Unable to load report approvals');

 const money=(amount:number|null)=>amount==null?'—':Number(amount).toLocaleString('en-MY',{style:'currency',currency:'MYR'});
 const stageRows=await Promise.all(result.data.map(async r=>[r.id,(await documentVerification('gym',r.id)).length] as const));
 const stages=new Map(stageRows);
 const pending=result.data.filter(r=>!r.approved_at).length;
 return <AppShell profile={profile} title="Gym Report Approvals">
 <div className="section-head"><div><p className="eyebrow">GYM MEMBERSHIP · MONTHLY REPORTS</p><h2>Report approvals</h2><p className="subtle">Review each completed month. Fikri verifies first, followed by Kevin, then James approves before delivery to Accounts.</p></div><Link className="button secondary" href="/admin/members">Back to membership</Link></div>
 <section className="panel"><div className="section-head"><div><h3>{pending} reports awaiting approval</h3><p className="subtle">Fikri Verify → Kevin Verify → James Approve &nbsp; | &nbsp; Accounts · account1@keanlenggroup.com</p></div><div className="actions"><Link className="button secondary" href="/admin/members/payment-list">Payment lists</Link><Link className="button secondary" href="/admin/members/committee-reports">Committee reports</Link></div></div>
 {profile.id!==BILLING_APPROVER_ID&&<p className="subtle">Open a report to review its verification and approval progress.</p>}</section>
 {!result.data.length&&<section className="panel"><h3>No reports awaiting review</h3><p className="subtle">Completed monthly reports will appear here.</p></section>}
 {result.data.map(r=><section className="panel" key={r.id} id={`report-${r.id}`}>
 <div className="section-head"><div><p className="eyebrow">{new Date(r.month+'T12:00:00Z').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'Asia/Kuala_Lumpur'})}</p><h3>{r.kind==='committee'?'Sports Committee Report':'Monthly Payment List'}</h3></div><strong style={{color:r.sent_at?'#28704c':'#8b641b'}}>{r.sent_at?'Sent to Accounts':r.approved_at?'Approved · delivery pending':'Awaiting '+documentReviewers[stages.get(r.id)||0].name}</strong></div>
 {r.kind==='committee'?<p><strong>{r.snapshot.member_count} members · {money(r.snapshot.total_amount)}</strong> &nbsp; Committee payable · <strong>{money(r.snapshot.remuneration)}</strong></p>:<p className="subtle">{r.snapshot.length} payment entries</p>}
 <details><summary className="text-link">Review report entries</summary><div className="table-wrap" style={{marginTop:16}}><table className="table">
 {r.kind==='committee'?<><thead><tr><th>No.</th><th>Member</th><th>Collection</th></tr></thead><tbody>{r.snapshot.entries.map((e:{member_id:string;full_name:string;amount:number},i:number)=><tr key={e.member_id}><td>{i+1}</td><td>{e.full_name}</td><td>{money(e.amount)}</td></tr>)}</tbody></>:<><thead><tr><th>No.</th><th>Date</th><th>Receipt</th><th>Member</th><th>Room / Member No.</th><th>Amount</th></tr></thead><tbody>{r.snapshot.map((e:{id:string;collected_on:string;receipt_no:string;full_name:string;member_reference:string;amount:number|null},i:number)=><tr key={e.id}><td>{i+1}</td><td>{e.collected_on}</td><td>{e.receipt_no||'—'}</td><td>{e.full_name}</td><td>{e.member_reference||'—'}</td><td>{money(e.amount)}</td></tr>)}</tbody></>}
 </table></div></details>
 <div className="actions" style={{marginTop:20}}>{!r.approved_at&&<Link className="button secondary" href={'/admin/document-review/gym/'+r.id}>Review verification &amp; approval</Link>}
 {r.approved_at&&<p className="subtle">Approved {new Date(r.approved_at).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur'})} MYT</p>}</div>
 </section>)}</AppShell>;
}
