import {notifyDocumentReviewer} from '@/lib/document-review-notifications';
import {signaturePhotoBounds} from '@/lib/signature-image-layout';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireRole} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {AppShell} from '@/components/app-shell';
import {SubmitButton} from '@/components/submit-button';
import {documentReviewers,documentVerification} from '@/lib/document-review';
import {signatureSchema,type Signature} from '@/lib/purchase-orders/signature';
import {dispatchBillingMail} from '@/lib/billing-mail';
import {deliverGymReport} from '@/lib/gym-report-delivery';
import {companySealDataUrl} from '@/lib/company-seal';

function valid(type:string,id:string){
 return ['gym','billing'].includes(type)&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
}
function SignatureImage({signature}:{signature?:Signature|null}){
 if(!signature)return <span className="subtle">Pending</span>;
 if(signature.imageDataUrl){
 const b=signaturePhotoBounds(signature.imageDataUrl);
 return <svg viewBox={b.left+' '+b.top+' '+b.width+' '+b.height} role="img" aria-label="Personal signature" style={{width:150,height:55}}><image href={signature.imageDataUrl} width={b.imageWidth} height={b.imageHeight}/></svg>;
}
 return <svg viewBox="0 0 600 180" role="img" aria-label="Personal signature" style={{width:150,height:55}}>{signature.strokes.map((s,i)=><polyline key={i} points={s.map(([x,y])=>x*600+','+y*180).join(' ')} fill="none" stroke="black" strokeWidth="2.4"/>)}</svg>;
}
async function advance(form:FormData){
 'use server';
 const user=await requireRole(['admin']);
 const type=String(form.get('type')),id=String(form.get('id'));
 if(!valid(type,id))throw Error('Invalid document');
 const entries=await documentVerification(type,id);
 const assigned=documentReviewers[entries.length];
 if(assigned?.id!==user.id)throw Error('This document is awaiting another reviewer.');
 const session=await createClient();
 if(entries.length<2){
   const verified=await session.rpc('verify_document',{p_type:type,p_id:id});
   if(verified.error)throw Error(verified.error.message);
 }else if(type==='billing'){
   const approved=await session.rpc('approve_billing_run',{billing_run_id:id});
   if(approved.error)throw Error(approved.error.message);
   await dispatchBillingMail(id);
 }else{
   const db=createAdminClient();
   const sig=await db.from('user_e_signatures').select('signature').eq('user_id',user.id).single();
   if(sig.error)throw Error('Save your personal E-signature first.');
   const saved=await db.from('gym_monthly_approvals').update({approved_at:new Date().toISOString(),approver:user.id,signature:signatureSchema.parse(sig.data.signature)}).eq('id',id).is('approved_at',null);
   if(saved.error)throw Error(saved.error.message);
   await deliverGymReport(id);
 }
 if(entries.length<2)await notifyDocumentReviewer(type as 'billing'|'gym',id).catch(error=>console.error('Reviewer notification pending retry',error));
 revalidatePath('/admin');revalidatePath('/admin/members/report-approvals');revalidatePath('/admin/document-review/'+type+'/'+id);
 redirect('/admin/document-review/'+type+'/'+id);
}
export default async function Page({params}:{params:Promise<{type:string;id:string}>}){
 const user=await requireRole(['admin']);
 const {type,id}=await params;
 if(!valid(type,id))redirect('/admin');
 const db=createAdminClient();
 const [document,entries]=await Promise.all([
 type==='billing'?db.from('billing_preview_runs').select('*').eq('id',id).single():db.from('gym_monthly_approvals').select('*').eq('id',id).single(),
 documentVerification(type,id)
 ]);
 if(document.error)throw Error('Unable to load this document');
 const doc=document.data;
 const billingApproval=type==='billing'?await db.from('billing_run_approvals').select('*').eq('run_id',id).maybeSingle():null;
 if(billingApproval?.error)throw Error('Unable to load approval');
 const approved=type==='billing'?billingApproval?.data:doc.approved_at?doc:null;
 const title=type==='billing'?(doc.kind==='rental'?'Rental invoice pack':'Utilities invoice pack'):doc.kind==='committee'?'Sports Committee Report':'Monthly Payment List';
 const period=type==='billing'?doc.period:doc.month.slice(0,7);
 const money=(n:number|null)=>n==null?'—':Number(n).toLocaleString('en-MY',{style:'currency',currency:'MYR'});
 const next=documentReviewers[entries.length];
 return <AppShell profile={user} title="Document review"><style>{`.report-entries-grid th,.report-entries-grid td{border:1px solid #b8ae96}.report-entries-grid{border-collapse:collapse}`}</style><div className="section-head"><div><p className="eyebrow">{period} · DOCUMENT REVIEW</p><h2>{title}</h2><p className="subtle">Fikri Verify → Kevin Verify → James Approve</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><a className="button secondary" href={'/api/document-review/'+type+'/'+id+'/preview'} target="_blank" rel="noopener noreferrer">{type==='billing'?'Preview Invoice':'Preview Report'}</a><Link className="button secondary" href="/admin">Back to Dashboard</Link></div></div>
 <section className="panel"><h3>{approved?'Approved by James':'Awaiting '+next.name+(entries.length===2?' approval':' verification')}</h3>
 <div className="table-wrap"><table className="table report-entries-grid"><thead><tr><th>Verified by Fikri</th><th>Verified by Kevin</th><th>Approved by James</th></tr></thead><tbody><tr>{[0,1,2].map(i=><td key={i}><SignatureImage signature={i<2?entries[i]?.signature:approved?.signature}/>{i===2&&approved&&<img src={companySealDataUrl} alt="Company seal" style={{width:55,height:55,objectFit:'contain'}}/>}<div style={{borderTop:"1px solid #555",marginTop:8,maxWidth:210}}/><p className="subtle">{(i<2?entries[i]?.verified_at:approved?.approved_at)?new Date(i<2?entries[i].verified_at:approved.approved_at).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur'})+' MYT':'Pending'}</p></td>)}</tr></tbody></table></div>
 {!approved&&next.id===user.id&&<form action={advance}><input type="hidden" name="type" value={type}/><input type="hidden" name="id" value={id}/><SubmitButton pendingText={entries.length===2?'Approving…':'Verifying…'}>{entries.length===2?'Approve & send to Accounts':'Verify & forward to '+documentReviewers[entries.length+1].name}</SubmitButton></form>}
 </section>
 <section className="panel"><h3>Report entries</h3><div className="table-wrap"><table className="table report-entries-grid">
 {type==='billing'?<><thead><tr><th>Invoice</th><th>Name</th><th>Amount</th></tr></thead><tbody>{doc.snapshot.lines.map((r:{billNo:string;name:string;amount:number},i:number)=><tr key={i}><td>{r.billNo}</td><td>{r.name}</td><td>{money(r.amount)}</td></tr>)}</tbody></>:doc.kind==='committee'?<><thead><tr><th>Member</th><th>Collection</th></tr></thead><tbody>{doc.snapshot.entries.map((r:{member_id:string;full_name:string;amount:number})=><tr key={r.member_id}><td>{r.full_name}</td><td>{money(r.amount)}</td></tr>)}</tbody></>:<><thead><tr><th>Date</th><th>Receipt</th><th>Member</th><th>Room / Member No.</th><th>Amount</th></tr></thead><tbody>{doc.snapshot.map((r:{id:string;collected_on:string;receipt_no:string;full_name:string;member_reference:string;amount:number|null})=><tr key={r.id}><td>{r.collected_on}</td><td>{r.receipt_no}</td><td>{r.full_name}</td><td>{r.member_reference}</td><td>{money(r.amount)}</td></tr>)}</tbody></>}
 </table></div>{type==='billing'&&<Link className="button secondary" href={'/admin/billing#invoice-'+id}>Open full invoice pack</Link>}
 {type==='billing'?<p>Total {money(doc.total)}</p>:doc.kind==='committee'?<p>Total collection {money(doc.snapshot.total_amount)} · Committee payable {money(doc.snapshot.remuneration)}</p>:<p>Total {money(doc.snapshot.reduce((n:number,r:{amount:number|null})=>n+Number(r.amount||0),0))}</p>}</section></AppShell>;
}
