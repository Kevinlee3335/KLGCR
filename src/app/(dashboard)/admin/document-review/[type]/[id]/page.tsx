import {signaturePhotoBounds} from '@/lib/signature-image-layout';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {requireRole} from '@/lib/auth';
import {loadBillingReviewEntries} from '@/lib/billing-document-queries';
import {createAdminClient} from '@/lib/supabase/admin';
import {AppShell} from '@/components/app-shell';
import {SubmitButton} from '@/components/submit-button';
import {documentReviewers,documentVerification} from '@/lib/document-review';
import type {Signature} from '@/lib/purchase-orders/signature';
import {companySealDataUrl} from '@/lib/company-seal';

import { isDocumentReviewTarget } from '@/lib/document-review-status';
import { DocumentDeliveryStatus } from '@/components/document-delivery-status';
import { advanceDocumentReview } from './actions';

export const maxDuration = 60;

function SignatureImage({signature}:{signature?:Signature|null}){
 if(!signature)return <span className="subtle">Pending</span>;
 if(signature.imageDataUrl){
 const b=signaturePhotoBounds(signature.imageDataUrl);
 return <svg viewBox={b.left+' '+b.top+' '+b.width+' '+b.height} role="img" aria-label="Personal signature" style={{width:150,height:55}}><image href={signature.imageDataUrl} width={b.imageWidth} height={b.imageHeight}/></svg>;
}
 return <svg viewBox="0 0 600 180" role="img" aria-label="Personal signature" style={{width:150,height:55}}>{signature.strokes.map((s,i)=><polyline key={i} points={s.map(([x,y])=>x*600+','+y*180).join(' ')} fill="none" stroke="black" strokeWidth="2.4"/>)}</svg>;
}
export default async function Page({params}:{params:Promise<{type:string;id:string}>}){
 const user=await requireRole(['admin']);
 const {type,id}=await params;
 if(!isDocumentReviewTarget(type,id))redirect('/admin');
 const db=createAdminClient();
 const [document,entries,billingApproval,billingEntries]=await Promise.all([
 type==='billing'
  ? db.from('billing_preview_runs').select('kind,period,total').eq('id',id).single()
  : db.from('gym_monthly_approvals').select('kind,month,snapshot,approved_at,signature').eq('id',id).single(),
 documentVerification(type,id),
 type==='billing'?db.from('billing_run_approvals').select('approved_at,signature').eq('run_id',id).maybeSingle():null,
 type==='billing'?loadBillingReviewEntries(id):[],
 ]);
 if(document.error)throw Error('Unable to load this document');
 const doc=document.data;
 if(billingApproval?.error)throw Error('Unable to load approval');
 const approved='approved_at' in doc && doc.approved_at ? doc : billingApproval?.data;
 const title=type==='billing'?(doc.kind==='rental'?'Rental invoice pack':'Utilities invoice pack'):doc.kind==='committee'?'Sports Committee Report':'Monthly Payment List';
 const period='period' in doc?doc.period:doc.month.slice(0,7);
 const gymSnapshot='snapshot' in doc?doc.snapshot:null;
 const money=(n:number|null)=>n==null?'—':Number(n).toLocaleString('en-MY',{style:'currency',currency:'MYR'});
 const next=documentReviewers[entries.length];
 return <AppShell profile={user} title="Document review"><style>{`.report-entries-grid th,.report-entries-grid td{border:1px solid #b8ae96}.report-entries-grid{border-collapse:collapse}`}</style><div className="section-head"><div><p className="eyebrow">{period} · DOCUMENT REVIEW</p><h2>{title}</h2><p className="subtle">Fikri Verify → Kevin Verify → James Approve</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><a className="button secondary" href={'/api/document-review/'+type+'/'+id+'/preview'} target="_blank" rel="noopener noreferrer">{type==='billing'?'Preview Invoice':'Preview Report'}</a><Link className="button secondary" href="/admin">Back to Dashboard</Link></div></div>
 <section className="panel"><h3>{approved?'Approved by James':'Awaiting '+next.name+(entries.length===2?' approval':' verification')}</h3>
 <div className="table-wrap"><table className="table report-entries-grid">
  <thead><tr><th>Verified by Fikri</th><th>Verified by Kevin</th><th>Approved by James</th></tr></thead>
  <tbody><tr>{[0,1,2].map(i => {
   const timestamp = i < 2 ? entries[i]?.verified_at : approved?.approved_at;
   return <td key={i}>
    <SignatureImage signature={i < 2 ? entries[i]?.signature : approved?.signature}/>
    {i === 2 && approved && <img src={companySealDataUrl} alt="Company seal" style={{width:55,height:55,objectFit:'contain'}}/>}
    <div style={{borderTop:"1px solid #555",marginTop:8,maxWidth:210}}/>
    <p className="subtle">{timestamp ? new Date(timestamp).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur'})+' MYT' : 'Pending'}</p>
   </td>;
  })}</tr></tbody>
 </table></div>
 {!approved&&next.id===user.id&&<form action={advanceDocumentReview}><input type="hidden" name="type" value={type}/><input type="hidden" name="id" value={id}/><SubmitButton pendingText={entries.length===2?'Approving…':'Verifying…'}>{entries.length===2?'Approve & send to Accounts':'Verify & forward to '+documentReviewers[entries.length+1].name}</SubmitButton></form>}
 {approved && <DocumentDeliveryStatus key={type+':'+id} type={type} id={id} />}
 </section>
 <section className="panel"><h3>Report entries</h3><div className="table-wrap"><table className="table report-entries-grid">
 {type==='billing' ? <>
  <thead><tr><th>Invoice</th><th>Name</th><th>Amount</th></tr></thead>
  <tbody>
   {billingEntries.map(row => (
    <tr key={row.line_index}><td>{row.bill_no}</td><td>{row.account_name}</td><td>{money(row.amount)}</td></tr>
   ))}
  </tbody>
 </> : doc.kind==='committee'?<><thead><tr><th>Member</th><th>Collection</th></tr></thead><tbody>{gymSnapshot.entries.map((r:{member_id:string;full_name:string;amount:number})=><tr key={r.member_id}><td>{r.full_name}</td><td>{money(r.amount)}</td></tr>)}</tbody></>:<><thead><tr><th>Date</th><th>Receipt</th><th>Member</th><th>Room / Member No.</th><th>Amount</th></tr></thead><tbody>{gymSnapshot.map((r:{id:string;collected_on:string;receipt_no:string;full_name:string;member_reference:string;amount:number|null})=><tr key={r.id}><td>{r.collected_on}</td><td>{r.receipt_no}</td><td>{r.full_name}</td><td>{r.member_reference}</td><td>{money(r.amount)}</td></tr>)}<tr><td colSpan={4}><strong>TOTAL AMOUNT</strong></td><td><strong>{money(gymSnapshot.reduce((n:number,r:{amount:number|null})=>n+Number(r.amount||0),0))}</strong></td></tr></tbody></>}
 </table></div>{type==='billing'&&<Link className="button secondary" prefetch={false} href={'/admin/billing#invoice-'+id}>Open full invoice pack</Link>}
 {'total' in doc?<p>Total {money(doc.total)}</p>:doc.kind==='committee'?<p>Total collection {money(gymSnapshot.total_amount)} · Committee payable {money(gymSnapshot.remuneration)}</p>:<p>Total {money(gymSnapshot.reduce((n:number,r:{amount:number|null})=>n+Number(r.amount||0),0))}</p>}</section></AppShell>;
}
