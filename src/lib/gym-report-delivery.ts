import { PDFDocument } from 'pdf-lib';
import { createAdminClient } from './supabase/admin';
import { financialPdf } from './official-receipt';
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
 if(r.sent_at || (!approved && r.notified_at))return;
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
   const sig=signatureSchema.parse(r.signature);
   const doc=await PDFDocument.load(pdf);
   const page=doc.addPage([842,595]);
   page.drawText(title,{x:42,y:524,size:18});
   page.drawText('Approved by James | '+new Date(r.approved_at).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur'})+' MYT',{x:42,y:460,size:13});
   if(sig.imageDataUrl){const ink=await doc.embedPng(sig.imageDataUrl);page.drawImage(ink,{x:42,y:364,...ink.scaleToFit(180,72)});}
   else for(const stroke of sig.strokes)for(let i=1;i<stroke.length;i++){
     const pt=(p:number[])=>({x:42+p[0]*180,y:436-p[1]*72});
     page.drawLine({start:pt(stroke[i-1]),end:pt(stroke[i]),thickness:1.2});
   }
   page.drawImage(await doc.embedPng(companySealDataUrl),{x:236,y:364,width:72,height:72});
   pdf=Buffer.from(await doc.save());to=BILLING_MAIL_TO;key='membership_'+r.id;
   body='Dear Joey,\n\nAttached is the '+title+' approved by James.\n\nKLG Campus Residence';
 }else{
   const james=await db.from('profiles').select('email').eq('id',BILLING_APPROVER_ID).eq('is_active',true).single();
   if(james.error||!james.data.email)throw Error('James email unavailable');
   to=james.data.email;key='membership_'+r.notice_key;
   body='Dear James,\n\nPlease review the attached '+title+' and approve it in KLGCR:\nhttps://klgcr-maintenance-system.vercel.app/admin/members/report-approvals\n\nKLG Campus Residence';
 }
 const result=await gmailGateway({action:'finance-send',key,from:BILLING_MAIL_FROM,to,subject:(approved?'Approved: ':'Approval required: ')+title,text:body,fileName:title+'.pdf',pdfBase64:pdf.toString('base64')},25000);
 if(result.ok!==true||result.status!=='sent'||result.key!==key||result.sender!==BILLING_MAIL_FROM||result.to!==to)throw Error('Gym report delivery not confirmed');
 const saved=await db.from('gym_monthly_approvals').update(approved?{sent_at:result.sentAt}:{notified_at:result.sentAt}).eq('id',id);
 if(saved.error)throw saved.error;
}

export async function deliverDueGymReports(){
 const db=createAdminClient();
 const queued=await db.rpc('queue_gym_monthly_reports');if(queued.error)throw queued.error;
 const due=await db.from('gym_monthly_approvals').select('id').is('sent_at',null).or('notified_at.is.null,approved_at.not.is.null');
 if(due.error)throw due.error;
 const results=await Promise.allSettled(due.data.map(row=>deliverGymReport(row.id)));
 if(results.some(r=>r.status==='rejected'))throw Error('Gym report delivery pending retry');
}