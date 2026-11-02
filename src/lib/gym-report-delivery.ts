import {documentVerification,documentReviewers,type Verification} from './document-review';
import { createAdminClient } from './supabase/admin';
import {gymReportPdf} from './gym-report-pdf';
import { gmailGateway } from './billing-mail';
import { BILLING_MAIL_FROM, BILLING_MAIL_TO } from './billing-mail-settings';
import { BILLING_APPROVER_ID } from './billing-approval';

export async function deliverGymReport(id:string) {
 const db=createAdminClient();
 const {data:r,error}=await db.from('gym_monthly_approvals').select('*').eq('id',id).single();
 if(error)throw error;
 const approved=!!r.approved_at;
 if(r.sent_at)return;
 const verifications=approved?(r.verifications||[]) as Verification[]:await documentVerification('gym',id);
 const reviewer=documentReviewers[verifications.length];
 if(!approved && r.reviewer_notices?.[reviewer.username])return;
 const title=(r.kind==='committee'?'Sports Committee Report':'Monthly Payment List')+' - '+r.month.slice(0,7);
 let pdf=await gymReportPdf(r);
 let to:string,key:string,body:string;
 if(approved){
   if(r.approver!==BILLING_APPROVER_ID)throw Error('James approval required');
   to=BILLING_MAIL_TO;key='membership_'+r.id;
   body='Dear Joey,\n\nAttached is the '+title+' approved by James.\n\nKLG Campus Residence';
 }else{
   const person=await db.from('profiles').select('email').eq('id',reviewer.id).eq('is_active',true).single();
   if(person.error||!person.data.email)throw Error('Reviewer email unavailable');
   to=person.data.email;key='membership_'+r.reviewer_keys[reviewer.username];
   body='Dear '+reviewer.name+',\n\nPlease review the attached '+title+' in KLGCR:\nhttps://klgcr-maintenance-system.vercel.app/admin/document-review/gym/'+r.id+'\n\nKLG Campus Residence';

 }
 const result=await gmailGateway({action:'finance-send',key,from:BILLING_MAIL_FROM,to,subject:(approved?'Approved: ':'Approval required: ')+title,text:body,fileName:title+'.pdf',pdfBase64:pdf.toString('base64')},25000);
 if(result.ok!==true||result.status!=='sent'||result.key!==key||result.sender!==BILLING_MAIL_FROM||result.to!==to)throw Error('Gym report delivery not confirmed');
 const saved=await db.from('gym_monthly_approvals').update(approved?{sent_at:result.sentAt}:{notified_at:result.sentAt,reviewer_notices:{...r.reviewer_notices,[reviewer.username]:result.sentAt}}).eq('id',id);
 if(saved.error)throw saved.error;
}

export async function deliverDueGymReports(){
 const db=createAdminClient();
 const queued=await db.rpc('queue_gym_monthly_reports');if(queued.error)throw queued.error;
 const due=await db.from('gym_monthly_approvals').select('id').is('sent_at',null);
 if(due.error)throw due.error;
 const results=await Promise.allSettled(due.data.map(row=>deliverGymReport(row.id)));
 if(results.some(r=>r.status==='rejected'))throw Error('Gym report delivery pending retry');
}