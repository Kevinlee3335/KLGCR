/* KLGCR Gmail gateway v2. Deploy the existing Web App as klgcr.noreply@gmail.com.
 * Keep an existing WEBSITE_EMAIL_SECRET constant, or use Script Property KLGCR_GMAIL_WEB_APP_SECRET. It must match the existing website secret.
 * Manage deployments > Edit > New version > Execute as Me > Anyone. Keep its /exec URL.
 * This file contains no secret. Existing to/subject/text/html messages remain supported.
 */
var KLG_BILLING_FROM='klgcr.noreply@gmail.com';
var KLG_BILLING_TO='account1@keanlenggroup.com';
var KLG_BILLING_CC=['klgcr.kevin@gmail.com','klgcr.fikri@gmail.com'];
function klgReply(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function doPost(e){
 var request;
 try{request=JSON.parse(e.postData.contents);}catch(ignore){return klgReply({ok:false,status:'rejected'});}
 var props=PropertiesService.getScriptProperties(),secret=typeof WEBSITE_EMAIL_SECRET!=='undefined'?WEBSITE_EMAIL_SECRET:props.getProperty('KLGCR_GMAIL_WEB_APP_SECRET');
 if(!secret||request.secret!==secret)return klgReply({ok:false,status:'rejected'});
 var sender=Session.getEffectiveUser().getEmail().toLowerCase();
 if(request.action==='billing-capabilities')return klgReply({ok:sender===KLG_BILLING_FROM,version:2,sender:sender,capabilities:['cc','htmlAttachment','idempotency']});
 if(request.action==='po-capabilities')return klgReply({ok:sender===KLG_BILLING_FROM,version:2,sender:sender,capabilities:['poPdf','cc','idempotency']});
 if(request.action==='po-send')return klgPoSend(request,props,sender);
 if(request.action==='billing-send')return klgBillingSend(request,props,sender);
 // Retains the old gateway contract for resident and membership notifications.
 if(request.action||!request.to||!request.subject||!request.text)throw new Error('Invalid mail request');
 if(sender!==KLG_BILLING_FROM)throw new Error('Authorize this gateway under klgcr.noreply@gmail.com');
 MailApp.sendEmail({to:String(request.to),subject:String(request.subject),body:String(request.text),htmlBody:request.html||undefined,name:'KLG Campus Residence'});
 return klgReply({ok:true,sender:sender});
}
function klgBillingSend(request,props,sender){
 if(sender!==KLG_BILLING_FROM||request.from!==KLG_BILLING_FROM||request.to!==KLG_BILLING_TO||JSON.stringify(request.cc)!==JSON.stringify(KLG_BILLING_CC)||!/^[0-9a-f-]{36}$/i.test(request.key||'')||typeof request.invoiceHtml!=='string'||request.invoiceHtml.length>16000000||!request.subject||!request.text)return klgReply({ok:false,status:'rejected'});
 var property='billing_delivery_'+request.key,lock=LockService.getScriptLock();
 if(!lock.tryLock(10000))return klgReply({ok:false,status:'busy'});
 try{
  var prior=props.getProperty(property);
  if(prior){var receipt=JSON.parse(prior);return klgReply(receipt.status==='sent'?receipt:{ok:false,status:'uncertain',key:request.key});}
  if(MailApp.getRemainingDailyQuota()<3)return klgReply({ok:false,status:'rejected'});
  var attachment=Utilities.newBlob(request.invoiceHtml,'text/html',String(request.fileName||'KLGCR-approved-invoices.html').replace(/[^A-Za-z0-9._-]/g,'_'));
  // Write before MailApp: a stopped execution must never trigger another copy blindly.
  props.setProperty(property,JSON.stringify({status:'started',startedAt:new Date().toISOString()}));
  try{MailApp.sendEmail({to:KLG_BILLING_TO,cc:KLG_BILLING_CC.join(','),subject:String(request.subject),body:String(request.text),attachments:[attachment],name:'KLG Campus Residence'});}catch(error){return klgReply({ok:false,status:'uncertain',key:request.key});}
  var receipt={ok:true,status:'sent',key:request.key,sender:sender,to:KLG_BILLING_TO,cc:KLG_BILLING_CC,sentAt:new Date().toISOString()};
  props.setProperty(property,JSON.stringify(receipt));return klgReply(receipt);
 }finally{lock.releaseLock();}
}

// Building Material destinations are fixed independently of Rental/Utilities.
function klgPoSend(request,props,sender){
 var to='purchasing@keanlenggroup.com',cc=KLG_BILLING_CC;
 if(sender!==KLG_BILLING_FROM||request.from!==KLG_BILLING_FROM||request.to!==to||JSON.stringify(request.cc)!==JSON.stringify(cc)||!/^po_[0-9a-f-]{36}_r[1-9][0-9]*$/i.test(request.key||'')||typeof request.pdfBase64!=='string'||request.pdfBase64.length>16000000||!/^JVBERi0[A-Za-z0-9+/]*={0,2}$/.test(request.pdfBase64)||!request.subject||!request.text)return klgReply({ok:false,status:'rejected'});
 var property=request.key,lock=LockService.getScriptLock();
 if(!lock.tryLock(10000))return klgReply({ok:false,status:'busy'});
 try{
  var prior=props.getProperty(property);
  if(prior){var receipt=JSON.parse(prior);return klgReply(receipt.status==='sent'?receipt:{ok:false,status:'uncertain',key:request.key});}
  if(MailApp.getRemainingDailyQuota()<3)return klgReply({ok:false,status:'rejected'});
  var attachment=Utilities.newBlob(Utilities.base64Decode(request.pdfBase64),'application/pdf',String(request.fileName||'KLGCR-approved-PO.pdf').replace(/[^A-Za-z0-9._-]/g,'_'));
  props.setProperty(property,JSON.stringify({status:'started',startedAt:new Date().toISOString()}));
  try{MailApp.sendEmail({to:to,cc:cc.join(','),subject:String(request.subject),body:String(request.text),attachments:[attachment],name:'KLG Campus Residence'});}catch(error){return klgReply({ok:false,status:'uncertain',key:request.key});}
  var receipt={ok:true,status:'sent',key:request.key,sender:sender,to:to,cc:cc,sentAt:new Date().toISOString()};
  props.setProperty(property,JSON.stringify(receipt));return klgReply(receipt);
 }finally{lock.releaseLock();}
}
