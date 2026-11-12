/* KLGCR Gmail gateway v2. Deploy the existing Web App as klgcr.noreply@gmail.com.
 * Keep an existing WEBSITE_EMAIL_SECRET constant, or use Script Property KLGCR_GMAIL_WEB_APP_SECRET. It must match the existing website secret.
 * Manage deployments > Edit > New version > Execute as Me > Anyone. Keep its /exec URL.
 * This file contains no secret. Existing to/subject/text/html messages remain supported.
 */
var KLG_BILLING_FROM='klgcr.noreply@gmail.com';
var KLG_REPLY_TO='klgresidenceenquiry@gmail.com';
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
 if(request.action==='po-capabilities')return klgReply({ok:sender===KLG_BILLING_FROM,version:2,sender:sender,capabilities:['poPdf','officePoPdf','cc','idempotency']});
 if(request.action==='finance-capabilities')return klgReply({ok:sender===KLG_BILLING_FROM,version:3,sender:sender,capabilities:['financePdf','customerInvoicePdf','idempotency']});
 if(request.action==='compliance-capabilities')return klgReply({ok:sender===KLG_BILLING_FROM,sender:sender,invoiceCc:KLG_BILLING_TO,capabilities:['compliancePdf','invoiceCc','idempotency']});
 if(request.action==='compliance-send')return klgComplianceSend(request,props,sender);
 if(request.action==='finance-send')return klgFinanceSend(request,props,sender);
 if(request.action==='po-send')return klgPoSend(request,props,sender);
 if(request.action==='billing-send')return klgBillingSend(request,props,sender);
 // Retains the old gateway contract for resident and membership notifications.
 if(request.action||!request.to||!request.subject||!request.text)throw new Error('Invalid mail request');
 if(sender!==KLG_BILLING_FROM)throw new Error('Authorize this gateway under klgcr.noreply@gmail.com');
 MailApp.sendEmail({to:String(request.to),subject:String(request.subject),body:String(request.text),htmlBody:request.html||undefined,name:'KLG Campus Residence',replyTo:KLG_REPLY_TO});
 return klgReply({ok:true,sender:sender});
}

function klgComplianceSha(value){
 return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value)
  .map(function(byte){return ('0'+((byte+256)%256).toString(16)).slice(-2);}).join('');
}

function klgComplianceSend(request,props,sender){
 var kind=request.kind,to=request.to,key=request.key,hash=request.sha256;
 var cc=kind==='invoice'?[KLG_BILLING_TO]:[];
 var singleAddress=typeof to==='string'&&to.length<=254&&/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(to);
 var local=singleAddress?to.split('@')[0]:'';
 var internal=singleAddress&&(/@(?:[^@.]+\.)*(?:keanlenggroup\.com|klgresidence\.com)$/.test(to)||/^klgcr\..+@gmail\.com$/.test(to)||to===KLG_REPLY_TO||to===KLG_BILLING_FROM||to==='klgcampus@gmail.com');
 if(sender!==KLG_BILLING_FROM||request.from!==KLG_BILLING_FROM||
    (kind!=='quotation'&&kind!=='invoice')||!singleAddress||internal||
    /^(?:no[._-]?reply|do[._-]?not[._-]?reply)(?:[+._-]|$)/i.test(local)||
    JSON.stringify(request.cc)!==JSON.stringify(cc)||
    typeof hash!=='string'||!/^[0-9a-f]{64}$/.test(hash)||
    typeof key!=='string'||!/^compliance_[0-9a-f]{64}$/.test(key)||
    typeof request.subject!=='string'||!request.subject||request.subject.length>200||/[\r\n]/.test(request.subject)||
    typeof request.text!=='string'||!request.text)return klgReply({ok:false,status:'rejected'});
 if(key!=='compliance_'+klgComplianceSha(kind+'\n'+to+'\n'+hash))return klgReply({ok:false,status:'rejected'});
 var pdf=request.pdfBase64;
 if(typeof pdf!=='string'||pdf.length>16000000||pdf.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(pdf))
  return klgReply({ok:false,status:'rejected'});
 var lock=LockService.getScriptLock();
 if(!lock.tryLock(10000))return klgReply({ok:false,status:'busy'});
 try{
  var prior=props.getProperty(key);
  if(prior){
   var saved=JSON.parse(prior);
   return klgReply(saved.status==='sent'?saved:{ok:false,status:'uncertain',key:key});
  }
  if(MailApp.getRemainingDailyQuota()<1+cc.length)return klgReply({ok:false,status:'rejected'});
  var bytes=Utilities.base64Decode(pdf),header=false;
  for(var i=0;i+4<Math.min(1024,bytes.length);i++){
   if(bytes[i]===37&&bytes[i+1]===80&&bytes[i+2]===68&&bytes[i+3]===70&&bytes[i+4]===45){header=true;break;}
  }
  if(!header||klgComplianceSha(bytes)!==hash)return klgReply({ok:false,status:'rejected'});
  var fileName=String(request.fileName||'Supplier-document.pdf').replace(/[\r\n\\/\u0000-\u001f\u007f]/g,'_').slice(0,180);
  if(!/\.pdf$/i.test(fileName))fileName+='.pdf';
  var attachment=Utilities.newBlob(bytes,'application/pdf',fileName);
  var message={to:to,subject:request.subject,body:request.text,htmlBody:request.html||undefined,attachments:[attachment],name:'KLG Campus Residence',replyTo:KLG_REPLY_TO};
  if(cc.length)message.cc=cc.join(',');
  // A stopped execution after invoking Gmail cannot trigger a second copy.
  props.setProperty(key,JSON.stringify({status:'started',startedAt:new Date().toISOString()}));
  try{MailApp.sendEmail(message);}catch(error){return klgReply({ok:false,status:'uncertain',key:key});}
  var receipt={ok:true,status:'sent',key:key,kind:kind,sender:sender,to:to,cc:cc,sha256:hash,sentAt:new Date().toISOString()};
  props.setProperty(key,JSON.stringify(receipt));return klgReply(receipt);
 }finally{lock.releaseLock();}
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
  try{MailApp.sendEmail({to:KLG_BILLING_TO,cc:KLG_BILLING_CC.join(','),subject:String(request.subject),body:String(request.text),htmlBody:request.html||undefined,attachments:[attachment],name:'KLG Campus Residence',replyTo:KLG_REPLY_TO});}catch(error){return klgReply({ok:false,status:'uncertain',key:request.key});}
  var receipt={ok:true,status:'sent',key:request.key,sender:sender,to:KLG_BILLING_TO,cc:KLG_BILLING_CC,sentAt:new Date().toISOString()};
  props.setProperty(property,JSON.stringify(receipt));return klgReply(receipt);
 }finally{lock.releaseLock();}
}

// Building Material destinations are fixed independently of Rental/Utilities.
function klgPoSend(request,props,sender){
 var office=request.to==='khet_loong@yahoo.com';
 var to=office?'khet_loong@yahoo.com':'purchasing@keanlenggroup.com',cc=office?[]:KLG_BILLING_CC;
 if(sender!==KLG_BILLING_FROM||request.from!==KLG_BILLING_FROM||request.to!==to||JSON.stringify(request.cc)!==JSON.stringify(cc)||!/^po_[0-9a-f-]{36}_r[1-9][0-9]*$/i.test(request.key||'')||typeof request.pdfBase64!=='string'||request.pdfBase64.length>16000000||!/^JVBERi0[A-Za-z0-9+/]*={0,2}$/.test(request.pdfBase64)||!request.subject||!request.text)return klgReply({ok:false,status:'rejected'});
 var property=request.key,lock=LockService.getScriptLock();
 if(!lock.tryLock(10000))return klgReply({ok:false,status:'busy'});
 try{
  var prior=props.getProperty(property);
  if(prior){var receipt=JSON.parse(prior);return klgReply(receipt.status==='sent'?receipt:{ok:false,status:'uncertain',key:request.key});}
  if(MailApp.getRemainingDailyQuota()<3)return klgReply({ok:false,status:'rejected'});
  var attachment=Utilities.newBlob(Utilities.base64Decode(request.pdfBase64),'application/pdf',String(request.fileName||'KLGCR-approved-PO.pdf').replace(/[^A-Za-z0-9._-]/g,'_'));
  props.setProperty(property,JSON.stringify({status:'started',startedAt:new Date().toISOString()}));
  try{MailApp.sendEmail({to:to,cc:cc.join(','),subject:String(request.subject),body:String(request.text),htmlBody:request.html||undefined,attachments:[attachment],name:'KLG Campus Residence',replyTo:KLG_REPLY_TO});}catch(error){return klgReply({ok:false,status:'uncertain',key:request.key});}
  var receipt={ok:true,status:'sent',key:request.key,sender:sender,to:to,cc:cc,sentAt:new Date().toISOString()};
  props.setProperty(property,JSON.stringify(receipt));return klgReply(receipt);
 }finally{lock.releaseLock();}
}

// Official receipts, company statements and confirmed customer invoice packages.
function klgFinanceSend(request,props,sender){
 if(sender!==KLG_BILLING_FROM||request.from!==KLG_BILLING_FROM||!/^((receipt|membership|statement|invoice)_[0-9a-f-]{36})$/i.test(request.key||'')||!/^\S+@\S+\.\S+$/.test(request.to||'')||/[\r\n,;]/.test(request.to)||typeof request.pdfBase64!=='string'||request.pdfBase64.length>16000000||!/^JVBERi0[A-Za-z0-9+/]*={0,2}$/.test(request.pdfBase64)||!request.subject||!request.text)return klgReply({ok:false,status:'rejected'});
 var property='finance_delivery_'+request.key,lock=LockService.getScriptLock();
 if(!lock.tryLock(10000))return klgReply({ok:false,status:'busy'});
 try{
  var prior=props.getProperty(property);
  if(prior){var previous=JSON.parse(prior);return klgReply(previous.status==='sent'?previous:{ok:false,status:'uncertain',key:request.key});}
  if(MailApp.getRemainingDailyQuota()<1)return klgReply({ok:false,status:'rejected'});
  var attachment=Utilities.newBlob(Utilities.base64Decode(request.pdfBase64),'application/pdf',String(request.fileName||'KLGCR-Receipt.pdf').replace(/[^A-Za-z0-9._-]/g,'_'));
  props.setProperty(property,JSON.stringify({status:'started',startedAt:new Date().toISOString()}));
  try{MailApp.sendEmail({to:request.to,subject:String(request.subject),body:String(request.text),htmlBody:request.html||undefined,attachments:[attachment],name:'KLG Campus Residence',replyTo:KLG_REPLY_TO});}catch(error){return klgReply({ok:false,status:'uncertain',key:request.key});}
  var receipt={ok:true,status:'sent',key:request.key,sender:sender,to:request.to,sentAt:new Date().toISOString()};
  props.setProperty(property,JSON.stringify(receipt));return klgReply(receipt);
 }finally{lock.releaseLock();}
}
