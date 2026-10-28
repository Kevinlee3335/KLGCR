import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createAdminClient} from './supabase/admin';
import {withBillingApproval,type BillingApproval} from './billing-approval';
import {buildBillingPrintHtml} from './billing-print-template';
import {BILLING_MAIL_FROM,BILLING_MAIL_TO,BILLING_MAIL_CC,type BillingMailStatus} from './billing-mail-settings';
const capabilityError='Email gateway needs upgrading or authorization under klgcr.noreply@gmail.com.';
async function gateway(payload:Record<string,unknown>,timeoutMs=15000){
 const url=process.env.KLGCR_GMAIL_WEB_APP_URL,secret=process.env.KLGCR_GMAIL_WEB_APP_SECRET;
 if(!url||!secret)throw Error('Gmail gateway is not configured.');
 const response=await fetch(url,{method:'POST',signal:AbortSignal.timeout(timeoutMs),headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,secret})});
 if(!response.ok)throw Error('Gmail gateway request failed.');
 return response.json();
}
export async function billingMailConnection(){
 try{const result=await gateway({action:'billing-capabilities'},7000);
  if(result.ok!==true||result.sender!==BILLING_MAIL_FROM||result.version!==2||!Array.isArray(result.capabilities)||!['cc','htmlAttachment','idempotency'].every(v=>result.capabilities?.includes(v)))return {ready:false,error:capabilityError};
  return {ready:true,sender:BILLING_MAIL_FROM};
 }catch{return {ready:false,error:capabilityError};}
}
export async function dispatchBillingMail(runId:string){
 const db=createAdminClient();
 const [pack,approval]=await Promise.all([db.from('billing_preview_runs').select('id,kind,period,snapshot').eq('id',runId).single(),db.from('billing_run_approvals').select('*').eq('run_id',runId).single()]);
 if(pack.error||approval.error)return {status:'blocked' as BillingMailStatus,error:'James approval is required before sending.'};
 const snapshot=withBillingApproval(pack.data.snapshot,approval.data as BillingApproval);
 if(!snapshot.approval)return {status:'blocked' as BillingMailStatus,error:'A valid James E-signature is required.'};
 // Also permits an explicit retry for an older approved pack; destinations are DB defaults, never request fields.
 const queue=await db.from('billing_mail_dispatch').upsert({run_id:runId},{onConflict:'run_id',ignoreDuplicates:true});
 if(queue.error)throw Error('Unable to queue approved invoice email.');
 const current=await db.from('billing_mail_dispatch').select('*').eq('run_id',runId).single();
 if(current.error)throw Error('Unable to read email status.');
 const event=current.data;
 if(event.status==='sent')return {status:'sent' as BillingMailStatus};
 if(event.status==='sending'){if(!event.attempted_at||Date.now()-Date.parse(event.attempted_at)<120000)return {status:'sending' as BillingMailStatus};const stale=await db.from('billing_mail_dispatch').update({status:'uncertain',error:'Previous delivery needs checking.'}).eq('run_id',runId).eq('status','sending').eq('attempted_at',event.attempted_at);if(stale.error)throw Error('Unable to review previous delivery.');}
 const check=await billingMailConnection();
 if(!check.ready){await db.from('billing_mail_dispatch').update({status:'blocked',error:check.error}).eq('run_id',runId).in('status',['pending','blocked','failed','uncertain']);return {status:'blocked' as BillingMailStatus,error:check.error};}
 const claim=await db.from('billing_mail_dispatch').update({status:'sending',error:null,attempted_at:new Date().toISOString()}).eq('run_id',runId).in('status',['pending','blocked','failed','uncertain']).select('*').maybeSingle();
 if(claim.error)throw Error('Unable to claim invoice email.');
 if(!claim.data)return {status:'sending' as BillingMailStatus};
 let status:BillingMailStatus='failed',error:string|null=null,sentAt:string|null=null,started=false;
 try{
  const logo=await readFile(join(process.cwd(),'public/billing/logo.jpg'));
  const invoiceHtml=buildBillingPrintHtml(snapshot,'data:image/jpeg;base64,'+logo.toString('base64')).replace('Test preview · No automatic printer submission','Approved invoice pack · James E-signature');
  const title=`James-approved ${pack.data.kind==='rental'?'Rental':'Utilities'} invoices - ${pack.data.period}`;
  const text=`${title}\n\nApproved by: ${snapshot.approval.approved_by}\nApproved on: ${new Date(snapshot.approval.approved_at).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur'})} MYT\n\n${snapshot.lines.map(l=>`${l.billNo} | ${l.name} | RM ${l.amount.toFixed(2)}`).join('\n')}\n\nTotal: RM ${snapshot.total.toFixed(2)}\n\nThe attached HTML contains the original approved invoices with James's E-signature. Open it in a browser to view or Print / Save as PDF.\n\nKLG Campus Residence Management`;
  started=true;
  const result=await gateway({action:'billing-send',key:event.delivery_key,from:BILLING_MAIL_FROM,to:BILLING_MAIL_TO,cc:[...BILLING_MAIL_CC],subject:title,text,invoiceHtml,fileName:`KLGCR-${pack.data.kind}-${pack.data.period}-approved.html`},20000);
  if(result.ok===true&&result.status==='sent'&&result.key===event.delivery_key&&result.sender===BILLING_MAIL_FROM&&result.to===BILLING_MAIL_TO&&JSON.stringify(result.cc)===JSON.stringify([...BILLING_MAIL_CC])&&Number.isFinite(Date.parse(result.sentAt))){status='sent';sentAt=result.sentAt;}
  else{status=result.status==='rejected'?'failed':'uncertain';error=result.status==='rejected'?'Gateway rejected the message; check the mail connection.':'Delivery needs review. Retry checks the same delivery key and does not send another copy.';}
 }catch{status=started?'uncertain':'failed';error=started?'Gateway response was interrupted. Retry checks the same delivery key.':'Unable to prepare the signed invoice email.';}
 const saved=await db.from('billing_mail_dispatch').update({status,sent_at:sentAt,error}).eq('run_id',runId).eq('status','sending');
 if(saved.error)throw Error('Email status needs review before any retry.');
 return {status,error};
}
