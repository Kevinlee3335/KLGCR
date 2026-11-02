import {createAdminClient} from './supabase/admin';
import {createAppNotifications} from './app-notifications';
import {documentReviewers} from './document-review-status';

// Each document and reviewer gets one persistent inbox notice, plus phone push.
export async function notifyDocumentReviewer(type:'billing'|'gym',id:string){
 const db=createAdminClient();
 const [doc,audit,approval]=await Promise.all([
  db.from(type==='billing'?'billing_preview_runs':'gym_monthly_approvals').select('*').eq('id',id).single(),
  db.from('document_verifications').select('entries').eq('document_type',type).eq('document_id',id).maybeSingle(),
  type==='billing'?db.from('billing_run_approvals').select('run_id').eq('run_id',id).maybeSingle():Promise.resolve({data:null,error:null})
 ]);
 if(doc.error||audit.error||approval.error)throw Error('Unable to check document reviewer');
 if(approval.data||(type==='gym'&&doc.data.approved_at))return;
 const stage=audit.data?.entries.length||0;
 const reviewer=documentReviewers[stage];
 if(!reviewer)return;
 const href='/admin/document-review/'+type+'/'+id;
 const existing=await db.from('app_notifications').select('id').eq('recipient_id',reviewer.id).eq('entity_id',id).eq('type','document_review_requested').limit(1);
 if(existing.error)throw Error('Unable to check reviewer notification');
 if(existing.data?.length)return;
 const title=type==='billing'?(doc.data.kind==='rental'?'Rental invoice pack':'Utilities invoice pack'):doc.data.kind==='committee'?'Sports Committee Report':'Monthly Payment List';
 await createAppNotifications({recipientIds:[reviewer.id],type:'document_review_requested',title:title+' · '+(stage===2?'Approval required':'Verification required'),body:(doc.data.period||doc.data.month.slice(0,7))+' · Please '+(stage===2?'approve':'verify')+' this document.',href,entityId:id});
}

// Retry missed notices after a transient delivery failure, including automatic packs.
export async function notifyPendingDocumentReviewers(){
 const db=createAdminClient();
 const [bills,gym]=await Promise.all([
  db.from('billing_preview_runs').select('id,billing_run_approvals!left(run_id)').is('billing_run_approvals',null),
  db.from('gym_monthly_approvals').select('id').is('approved_at',null)
 ]);
 if(bills.error||gym.error)throw Error('Unable to load pending reviewer notifications');
 for(const row of bills.data||[])await notifyDocumentReviewer('billing',row.id);
 for(const row of gym.data||[])await notifyDocumentReviewer('gym',row.id);
}
