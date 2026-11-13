import {dispatchDocumentReviewPushes} from './document-review-notifications';
import {documentVerification,type Verification} from './document-review';
import {documentReviewers,pendingDocumentReviewers} from './document-review-status';
import { createAdminClient } from './supabase/admin';
import {gymReportPdf} from './gym-report-pdf';
import { gmailGateway } from './billing-mail';
import { BILLING_MAIL_FROM, BILLING_MAIL_TO } from './billing-mail-settings';
import { BILLING_APPROVER_ID } from './billing-approval';

export async function deliverGymReport(id:string) {
 await dispatchDocumentReviewPushes(id).catch(error=>console.error('Document phone notification pending retry',error));
 const db=createAdminClient();
 const {data:r,error}=await db.from('gym_monthly_approvals').select('*').eq('id',id).single();
 if(error)throw error;
 const approved=!!r.approved_at;
 if(r.sent_at)return;
 const verifications=approved?(r.verifications||[]) as Verification[]:await documentVerification('gym',id);
 const pending = approved ? [] : pendingDocumentReviewers(verifications)
   .filter(reviewer => !r.reviewer_notices?.[reviewer.username]);
 if (!approved && pending.length === 0) return;
 if (approved && r.approver !== BILLING_APPROVER_ID) throw Error('James approval required');
 const title = (r.kind === 'committee' ? 'Sports Committee Report' : 'Monthly Payment List') + ' - ' + r.month.slice(0, 7);
 const pdfBase64 = (await gymReportPdf({ ...r, verifications })).toString('base64');
 const send = async (to: string, key: string, subject: string, text: string) => {
   const result = await gmailGateway({
     action: 'finance-send', key, from: BILLING_MAIL_FROM, to, subject, text, fileName: title + '.pdf', pdfBase64,
   }, 25000);
   if (result.ok !== true || result.status !== 'sent' || result.key !== key || result.sender !== BILLING_MAIL_FROM || result.to !== to) {
     throw Error('Gym report delivery not confirmed');
   }
   return result.sentAt;
 };

 if (approved) {
   const sentAt = await send(BILLING_MAIL_TO, 'membership_' + r.id, 'Approved: ' + title,
     'Dear Joey,\n\nAttached is the ' + title + ' approved by James.\n\nKLG Campus Residence');
   const saved = await db.from('gym_monthly_approvals').update({ sent_at: sentAt }).eq('id', id);
   if (saved.error) throw saved.error;
   return;
 }

 const results = await Promise.allSettled(pending.map(async reviewer => {
   const person = await db.from('profiles').select('email').eq('id', reviewer.id).eq('role', 'admin')
     .eq('is_active', true).is('deleted_at', null).single();
   if (person.error || !person.data.email) throw Error('Reviewer email unavailable');
   const action = reviewer === documentReviewers[2] ? 'Approval' : 'Verification';
   const sentAt = await send(person.data.email, 'membership_' + r.reviewer_keys[reviewer.username], action + ' required: ' + title,
     'Dear ' + reviewer.name + ',\n\nPlease review the attached ' + title +
     ' in KLGCR:\nhttps://klgcr-maintenance-system.vercel.app/admin/document-review/gym/' + r.id + '\n\nKLG Campus Residence');
   const saved = await db.rpc('record_gym_report_reviewer_notice', { p_id: id, p_reviewer: reviewer.username, p_sent_at: sentAt });
   if (saved.error) throw saved.error;
 }));
 if (results.some(result => result.status === 'rejected')) throw Error('Gym report reviewer email pending retry');
}

export async function deliverDueGymReports(){
 const db=createAdminClient();
 const queued=await db.rpc('queue_gym_monthly_reports');if(queued.error)throw queued.error;
 const due=await db.from('gym_monthly_approvals').select('id').is('sent_at',null);
 if(due.error)throw due.error;
 const results=await Promise.allSettled(due.data.map(row=>deliverGymReport(row.id)));
 if(results.some(r=>r.status==='rejected'))throw Error('Gym report delivery pending retry');
}