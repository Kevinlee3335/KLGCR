import {gmailGateway} from './billing-mail';
import {createAdminClient} from './supabase/admin';
import {financialPdf,type OfficialReceipt} from './official-receipt';
export async function sendFinancePdf(input:{key:string;to:string;subject:string;text:string;html?:string;pdf:Buffer;fileName:string}){
 const result=await gmailGateway({action:'finance-send',from:'klgcr.noreply@gmail.com',...input,pdf:undefined,pdfBase64:input.pdf.toString('base64')},25000);
 if(result.status==='uncertain')throw Error('Gmail could not confirm delivery. Check the noreply Sent folder.');
 if(result.status==='busy')throw Error('The noreply Gmail gateway is busy. Check the email status again.');
 if(result.ok!==true||result.status!=='sent'||result.sender!=='klgcr.noreply@gmail.com'||result.to!==input.to||result.key!==input.key)throw Error('Receipt email is pending. Check the Gmail gateway supports finance-send; retry uses the same delivery key.');
}
export async function emailOfficialReceipt(r:OfficialReceipt){
 if(!r.email)throw Error('Company email is required');
 const db=createAdminClient();
 try {
  await sendFinancePdf({key:'receipt_'+r.id,to:r.email,subject:'Official Receipt '+r.receipt_no,text:`Dear ${r.payer},\n\nPlease find your official receipt attached.\n${r.description}\nAmount received: RM ${Number(r.amount).toFixed(2)}\n\nKLG Campus Residence Management`,pdf:await financialPdf({receipt:r}),fileName:r.receipt_no.replace('/','-')+'.pdf'});
 } catch (error) {
  await db.from('official_receipts').update({email_error:error instanceof Error?error.message:'Email failed'}).eq('id',r.id).is('emailed_at',null);
  throw error;
 }
 const saved=await db.from('official_receipts').update({emailed_at:new Date().toISOString(),email_error:null}).eq('id',r.id).is('emailed_at',null);
 if(saved.error)throw Error('Receipt delivery was confirmed, but its status could not be saved. Check the email status again.');
}
