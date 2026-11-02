import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {SubmitButton} from '@/components/submit-button';
import {requireRole} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {BILLING_APPROVER_ID} from '@/lib/billing-approval';
import {deliverGymReport} from '@/lib/gym-report-delivery';
import {revalidatePath} from 'next/cache';
import {signatureSchema} from '@/lib/purchase-orders/signature';

async function approve(form:FormData){
 'use server';
 const james=await requireRole(['admin']);
 if(james.id!==BILLING_APPROVER_ID)throw Error('Only James can approve these reports.');
 const db=createAdminClient();
 const signature=await db.from('user_e_signatures').select('signature').eq('user_id',james.id).single();
 if(signature.error)throw Error('Set your personal E-signature before approval.');
 const id=String(form.get('id'));
 const saved=await db.from('gym_monthly_approvals').update({approved_at:new Date().toISOString(),approver:james.id,signature:signatureSchema.parse(signature.data.signature)}).eq('id',id).is('approved_at',null);
 if(saved.error)throw saved.error;
 await deliverGymReport(id);
 revalidatePath('/admin/members/report-approvals');
 revalidatePath('/admin');
}

export default async function Page(){
 const profile=await requireRole(['admin']);
 const result=await createAdminClient().from('gym_monthly_approvals').select('id,month,kind,approved_at,sent_at,snapshot').order('month',{ascending:false});
 if(result.error)throw Error('Unable to load report approvals');

 const money=(amount:number|null)=>amount==null?'—':Number(amount).toLocaleString('en-MY',{style:'currency',currency:'MYR'});
 const pending=result.data.filter(r=>!r.approved_at).length;
 return <AppShell profile={profile} title="Gym Report Approvals">
 <div className="section-head"><div><p className="eyebrow">GYM MEMBERSHIP · MONTHLY REPORTS</p><h2>Report approvals</h2><p className="subtle">Review each completed month. James approves the report before it is emailed to Accounts.</p></div><Link className="button secondary" href="/admin/members">Back to membership</Link></div>
 <section className="panel"><div className="section-head"><div><h3>{pending} reports awaiting approval</h3><p className="subtle">Approver · James &nbsp; | &nbsp; Accounts · account1@keanlenggroup.com</p></div><div className="actions"><Link className="button secondary" href="/admin/members/payment-list">Payment lists</Link><Link className="button secondary" href="/admin/members/committee-reports">Committee reports</Link></div></div>
 {profile.id!==BILLING_APPROVER_ID&&<p className="subtle">You can review the reports here. James can approve them using his account.</p>}</section>
 {!result.data.length&&<section className="panel"><h3>No reports awaiting review</h3><p className="subtle">Completed monthly reports will appear here.</p></section>}
 {result.data.map(r=><section className="panel" key={r.id} id={`report-${r.id}`}>
 <div className="section-head"><div><p className="eyebrow">{new Date(r.month+'T12:00:00Z').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'Asia/Kuala_Lumpur'})}</p><h3>{r.kind==='committee'?'Sports Committee Report':'Monthly Payment List'}</h3></div><strong style={{color:r.sent_at?'#28704c':'#8b641b'}}>{r.sent_at?'Sent to Accounts':r.approved_at?'Approved · delivery pending':'Awaiting James approval'}</strong></div>
 {r.kind==='committee'?<p><strong>{r.snapshot.member_count} members · {money(r.snapshot.total_amount)}</strong> &nbsp; Committee payable · <strong>{money(r.snapshot.remuneration)}</strong></p>:<p className="subtle">{r.snapshot.length} payment entries</p>}
 <details><summary className="text-link">Review report entries</summary><div className="table-wrap" style={{marginTop:16}}><table className="table">
 {r.kind==='committee'?<><thead><tr><th>No.</th><th>Member</th><th>Collection</th></tr></thead><tbody>{r.snapshot.entries.map((e:{member_id:string;full_name:string;amount:number},i:number)=><tr key={e.member_id}><td>{i+1}</td><td>{e.full_name}</td><td>{money(e.amount)}</td></tr>)}</tbody></>:<><thead><tr><th>No.</th><th>Date</th><th>Receipt</th><th>Member</th><th>Room / Member No.</th><th>Amount</th></tr></thead><tbody>{r.snapshot.map((e:{id:string;collected_on:string;receipt_no:string;full_name:string;member_reference:string;amount:number|null},i:number)=><tr key={e.id}><td>{i+1}</td><td>{e.collected_on}</td><td>{e.receipt_no||'—'}</td><td>{e.full_name}</td><td>{e.member_reference||'—'}</td><td>{money(e.amount)}</td></tr>)}</tbody></>}
 </table></div></details>
 <div className="actions" style={{marginTop:20}}>{profile.id===BILLING_APPROVER_ID&&!r.sent_at&&<form action={approve}><input type="hidden" name="id" value={r.id}/><SubmitButton pendingText={r.approved_at?'Sending…':'Approving…'}>{r.approved_at?'Retry delivery':'Approve & send to Accounts'}</SubmitButton></form>}
 {r.approved_at&&<p className="subtle">Approved {new Date(r.approved_at).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur'})} MYT</p>}</div>
 </section>)}</AppShell>;
}
