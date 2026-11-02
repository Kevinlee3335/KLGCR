import {documentVerification,documentReviewers,type Verification} from './document-review';
import { PDFDocument } from 'pdf-lib';
import { createAdminClient } from './supabase/admin';
import { financialPdf, financePaperSizes } from './official-receipt';
import { gmailGateway } from './billing-mail';
import { BILLING_MAIL_FROM, BILLING_MAIL_TO } from './billing-mail-settings';
import { BILLING_APPROVER_ID } from './billing-approval';
import { companySealDataUrl } from './company-seal';
import type { CommitteeReport } from './committee-report';
import type { PaymentListRow } from './membership-payment-list';
import { signatureSchema } from './purchase-orders/signature';

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
 const lines:string[]=[];
 if(r.kind==='committee'){
   const report=r.snapshot as CommitteeReport;
   lines.push('Members: '+report.member_count+'   Payments: '+report.payment_count,
     'Total collection: RM '+report.total_amount+'   Committee payable: RM '+report.remuneration,report.calculation_rule);
   for(const entry of report.entries)lines.push(entry.full_name+' | RM '+entry.amount, ...entry.payments.map(p=>p.approved_at.slice(0,10)+' | '+p.kind+' | '+p.membership_month+' | RM '+p.amount));
 }else{
   const entries=r.snapshot as PaymentListRow[];
   lines.push(entries.length+' entries','No. | Date | Receipt | Member | Room / Member No. | Amount');
   entries.forEach((p,i)=>lines.push([i+1,p.collected_on,p.receipt_no||'-',p.full_name,p.member_reference||'-',p.amount==null?'-':'RM '+p.amount].join(' | ')));
 }
 let pdf=await financialPdf({title,lines});
 let to:string,key:string,body:string;
 if(approved){
   if(r.approver!==BILLING_APPROVER_ID)throw Error('James approval required');
   const doc=await PDFDocument.load(pdf);
   const page=doc.addPage(financePaperSizes.a4);
   page.drawText(title,{x:36,y:770,size:17});
   const slots=[...verifications.map(v=>({name:'Verified by '+v.name,date:v.verified_at,signature:v.signature})),{name:'Approved by James',date:r.approved_at,signature:r.signature}];
   for(const [i,slot] of slots.entries()){
     const x=36+i*177,sig=signatureSchema.parse(slot.signature);
     page.drawText(slot.name,{x,y:696,size:10});
     page.drawText(new Date(slot.date).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur'})+' MYT',{x,y:675,size:8});
     if(sig.imageDataUrl){const ink=await doc.embedPng(sig.imageDataUrl);page.drawImage(ink,{x,y:600,...ink.scaleToFit(110,55)});}
     else for(const stroke of sig.strokes)for(let n=1;n<stroke.length;n++){
       const pt=(p:number[])=>({x:x+p[0]*110,y:655-p[1]*55});
       page.drawLine({start:pt(stroke[n-1]),end:pt(stroke[n]),thickness:1.2});
     }
     if(i===slots.length-1)page.drawImage(await doc.embedPng(companySealDataUrl),{x:x+116,y:600,width:46,height:46});
   }
   pdf=Buffer.from(await doc.save());to=BILLING_MAIL_TO;key='membership_'+r.id;
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