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
}

export default async function Page(){
 const profile=await requireRole(['admin']);
 const result=await createAdminClient().from('gym_monthly_approvals').select('id,month,kind,approved_at,sent_at,snapshot').order('month',{ascending:false});
 if(result.error)throw Error('Unable to load report approvals');
 return <main><h1>Gym monthly report approvals</h1>{result.data.map(r=><section key={r.id}><h2>{r.kind==='committee'?'Sports Committee Report':'Monthly Payment List'} · {r.month.slice(0,7)}</h2>
 <details><summary>Review report entries</summary>{r.kind==='committee'?<><p>Total RM {r.snapshot.total_amount} · Committee payable RM {r.snapshot.remuneration}</p><ul>{r.snapshot.entries.map((e:{member_id:string;full_name:string;amount:number})=><li key={e.member_id}>{e.full_name} · RM {e.amount}</li>)}</ul></>:<table><thead><tr><th>Date</th><th>Receipt</th><th>Member</th><th>Room</th><th>RM</th></tr></thead><tbody>{r.snapshot.map((e:{id:string;collected_on:string;receipt_no:string;full_name:string;member_reference:string;amount:number|null})=><tr key={e.id}><td>{e.collected_on}</td><td>{e.receipt_no}</td><td>{e.full_name}</td><td>{e.member_reference}</td><td>{e.amount??'—'}</td></tr>)}</tbody></table>}</details>
 <p>{r.sent_at?'Sent to Accounts':r.approved_at?'Approved · delivery pending':'Awaiting James approval'}</p>
 {profile.id===BILLING_APPROVER_ID&&!r.sent_at&&<form action={approve}><input type="hidden" name="id" value={r.id}/><button>{r.approved_at?'Retry delivery':'Approve and send to Accounts'}</button></form>}</section>)}</main>;
}