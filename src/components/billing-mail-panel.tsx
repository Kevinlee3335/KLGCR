'use client';
import {useState} from 'react';
import {BILLING_MAIL_FROM,BILLING_MAIL_TO,BILLING_MAIL_CC} from '@/lib/billing-mail-settings';
export function BillingMailPanel({canManage=false}:{canManage?:boolean}){
 const [message,setMessage]=useState('The connection is verified before each approved pack is sent.'),[checking,setChecking]=useState(false),[outcome,setOutcome]=useState('idle'),[checkedAt,setCheckedAt]=useState('');
 async function check(){
  if(checking)return;
  setChecking(true);setOutcome('checking');setCheckedAt('');setMessage('Checking Gmail connection… Please allow up to 25 seconds.');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
  try{
   const response=await fetch('/api/billing-preview/email-connection',{cache:'no-store',signal:controller.signal});
   let result;try{result=await response.json();}catch{throw Error('The website returned an invalid response. Refresh the page and sign in again.');}
   if(!response.ok)throw Error(response.status===403?'Your session is not authorized. Refresh and sign in with an Admin account.':result.error||'The connection check failed. Please try again.');
   setOutcome(result.ready?'success':'error');setMessage(result.ready?'Connected: klgcr.noreply@gmail.com supports CC and signed invoice attachments.':result.error||'Gmail connection could not be confirmed.');setCheckedAt(result.checkedAt||new Date().toISOString());
  }catch(error){setOutcome('error');setMessage(controller.signal.aborted?'The connection check timed out. Refresh the page, sign in again if needed, and retry.':error instanceof Error?error.message:'Unable to verify Gmail. Please try again.');setCheckedAt(new Date().toISOString());}
  finally{clearTimeout(timeout);setChecking(false);}
 }
 return <div className="billing-card"><h3>Approved invoice email</h3><p>From: <b>{BILLING_MAIL_FROM}</b><br/>To: {BILLING_MAIL_TO}<br/>CC: {BILLING_MAIL_CC.join(', ')}</p><p>After James approves, the system sends the original signed invoices as an HTML attachment that can be opened and printed to PDF.</p><div className={`billing-mail-result billing-mail-result-${outcome}`} role="status" aria-live="polite" aria-atomic="true"><strong>{checking?"Checking connection":outcome==="success"?"Connection verified":outcome==="error"?"Connection needs attention":"Email connection"}</strong><p>{message}</p>{checkedAt&&<small>Checked: {new Date(checkedAt).toLocaleString("en-GB",{timeZone:"Asia/Kuala_Lumpur"})} MYT</small>}</div>{canManage&&<><button type="button" disabled={checking} onClick={check}>{checking?'Checking…':'Check Gmail connection'}</button><details><summary>Gmail gateway setup</summary><p>In the existing Gmail gateway project, signed in as klgcr.noreply@gmail.com, update the doPost handler and add the helpers from the script below. Keep any existing form-submit handlers and triggers.</p><p>If your script already has a WEBSITE_EMAIL_SECRET line, keep it unchanged. Otherwise set the Script Property KLGCR_GMAIL_WEB_APP_SECRET to the existing matching website secret. Either method is supported. Do not post the secret in chat.</p><p>Manage deployments → Edit → New version. Execute as Me (klgcr.noreply@gmail.com), access Anyone. Keep the current /exec URL. Authorize MailApp and account-email access, then check the connection here.</p><a href="/billing-mail/gateway.gs" download>Download Gmail gateway update</a></details></>}</div>;
}
