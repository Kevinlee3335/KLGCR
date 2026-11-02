import {dispatchDocumentReviewPushes} from './document-review-notifications';
import {ensureDueRentalInvoice} from './rental-automation';
import {createAdminClient} from './supabase/admin';
import type {Signature} from './purchase-orders/signature';
import {documentReviewers} from './document-review-status';
export {documentReviewers} from './document-review-status';
export type Verification={user_id:string;name:string;verified_at:string;signature:Signature};
export type ReviewDocument={id:string;type:'gym'|'billing';title:string;period:string;amount:number|null;href:string};
export async function documentVerification(type:string,id:string):Promise<Verification[]>{
 const result=await createAdminClient().from('document_verifications').select('entries').eq('document_type',type).eq('document_id',id).maybeSingle();
 if(result.error)throw Error('Unable to load document verification');
 return result.data?.entries||[];
}
export async function pendingDocumentReviews(userId:string):Promise<ReviewDocument[]>{
 if(!documentReviewers.some(r=>r.id===userId))return [];
 await ensureDueRentalInvoice().catch(error=>console.error('Automatic rental generation pending retry',error));
 await dispatchDocumentReviewPushes().catch(error=>console.error('Document phone notification pending retry',error));
 const db=createAdminClient();
 const [gym,bills,audit]=await Promise.all([
 db.from('gym_monthly_approvals').select('id,month,kind,snapshot').is('approved_at',null).order('month').order('id'),
 db.from('billing_preview_runs').select('id,kind,period,total,billing_run_approvals!left(run_id)').is('billing_run_approvals',null).order('period').order('id'),
 db.from('document_verifications').select('document_type,document_id,entries')
 ]);
 if(gym.error||bills.error||audit.error)throw Error('Unable to load documents awaiting review');
 const stages=new Map(audit.data.map(row=>[row.document_type+':'+row.document_id,row.entries.length]));
 const documents:ReviewDocument[]=[
 ...gym.data.map(r=>({id:r.id,type:'gym' as const,title:r.kind==='committee'?'Sports Committee Report':'Monthly Payment List',period:r.month.slice(0,7),amount:r.kind==='committee'?Number(r.snapshot.remuneration):r.snapshot.reduce((n:number,p:{amount:number|null})=>n+Number(p.amount||0),0),href:'/admin/document-review/gym/'+r.id})),
 ...bills.data.map(r=>({id:r.id,type:'billing' as const,title:r.kind==='rental'?'Rental invoice pack':'Utilities invoice pack',period:r.period,amount:Number(r.total),href:'/admin/document-review/billing/'+r.id}))
 ];
 return documents.filter(d=>documentReviewers[stages.get(d.type+':'+d.id)||0]?.id===userId);
}