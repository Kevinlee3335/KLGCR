import {after} from 'next/server';
import {malaysiaClock} from './billing-preview';
import {dispatchDocumentReviewPushes} from './document-review-notifications';
import {ensureDueRentalInvoice} from './rental-automation';
import {createAdminClient} from './supabase/admin';
import type {Signature} from './purchase-orders/signature';
import {documentReviewers,pendingDocumentReviewers} from './document-review-status';
export {documentReviewers} from './document-review-status';
export type Verification={user_id:string;name:string;verified_at:string;signature:Signature};
export type ReviewDocument={id:string;type:'gym'|'billing';title:string;period:string;amount:number|null;href:string};
export async function documentVerification(type:string,id:string):Promise<Verification[]>{
 const result=await createAdminClient().from('document_verifications').select('entries').eq('document_type',type).eq('document_id',id).maybeSingle();
 if(result.error)throw Error('Unable to load document verification');
 return result.data?.entries||[];
}
export async function pendingDocumentReviews(userId:string):Promise<ReviewDocument[]>{
 const reviewer=documentReviewers.find(r=>r.id===userId);
 if(!reviewer)return [];
 const isVerifier=reviewer!==documentReviewers[2];
 const clock=malaysiaClock();
 const period=clock.date.slice(0,7);
 const db=createAdminClient();
 const billingReviews=()=>db.from('billing_preview_runs').select('id,kind,period,total,billing_run_approvals!left(run_id)').is('billing_run_approvals',null).order('period').order('id');
 const reviewStages=()=>db.from('document_verifications').select('document_type,document_id,entries');

 async function ensureRentalForVerifier(){
  const existing=await db.from('billing_preview_runs').select('id,billing_run_approvals(run_id)').eq('kind','rental').eq('period',period).maybeSingle();
  if(existing.data){
   const approval=existing.data.billing_run_approvals;
   const approved=Array.isArray(approval)?approval.length>0:Boolean(approval);
   return approved?null:{status:'exists'};
  }
  return ensureDueRentalInvoice(clock);
 }

 // The daily job runs these as well. A reviewer visit still provides a fallback
 // for schedules later in the day and for notifications awaiting retry.
 try {
  after(async()=>{
   if(!isVerifier)await ensureDueRentalInvoice(clock).catch(error=>console.error('Automatic rental generation pending retry',error));
   await dispatchDocumentReviewPushes().catch(error=>console.error('Document phone notification pending retry',error));
  });
 } catch (error) {
  console.error('Document review maintenance pending scheduled retry',error);
 }
 const [gym,initialBills,initialAudit,rental]=await Promise.all([
 db.from('gym_monthly_approvals').select('id,month,kind,snapshot').is('approved_at',null).order('month').order('id'),
 billingReviews(),
 reviewStages(),
 isVerifier?ensureRentalForVerifier().catch(error=>{console.error('Automatic rental generation pending retry',error);return null;}):null,
 ]);
 // A new pack can commit after the first list query starts. Read the billing
 // queue and verification state again so it appears during this visit.
 const needsRefresh=(rental?.status==='created'||rental?.status==='exists')
  && !initialBills.data?.some(row=>row.kind==='rental'&&row.period===period);
 const [bills,audit]=needsRefresh?await Promise.all([billingReviews(),reviewStages()]):[initialBills,initialAudit];
 if(gym.error||bills.error||audit.error)throw Error('Unable to load documents awaiting review');
 const signaturesByDocument=new Map(audit.data.map(row=>[row.document_type+':'+row.document_id,(row.entries || []) as Verification[]]));
 const documents:ReviewDocument[]=[
 ...gym.data.map(r=>({id:r.id,type:'gym' as const,title:r.kind==='committee'?'Sports Committee Report':'Monthly Payment List',period:r.month.slice(0,7),amount:r.kind==='committee'?Number(r.snapshot.remuneration):r.snapshot.reduce((n:number,p:{amount:number|null})=>n+Number(p.amount||0),0),href:'/admin/document-review/gym/'+r.id})),
 ...bills.data.map(r=>({id:r.id,type:'billing' as const,title:r.kind==='rental'?'Rental invoice pack':'Utilities invoice pack',period:r.period,amount:Number(r.total),href:'/admin/document-review/billing/'+r.id}))
 ];
 return documents.filter(d=>pendingDocumentReviewers(signaturesByDocument.get(d.type+':'+d.id)||[]).some(reviewer=>reviewer.id===userId));
}
