// @vitest-environment node
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {beforeEach,it,expect,vi} from 'vitest';
const source=readFileSync('public/billing-mail/gateway.gs','utf8');
let context:vm.Context;
let owner:string,properties:Map<string,string>,send:ReturnType<typeof vi.fn>,post:(data:unknown)=>Record<string,unknown>;
beforeEach(()=>{
 owner='klgcr.noreply@gmail.com';properties=new Map([['KLGCR_GMAIL_WEB_APP_SECRET','test-secret']]);send=vi.fn();
 context=vm.createContext({Session:{getEffectiveUser:()=>({getEmail:()=>owner})},MailApp:{sendEmail:send,getRemainingDailyQuota:()=>100},PropertiesService:{getScriptProperties:()=>({getProperty:(k:string)=>properties.get(k),setProperty:(k:string,v:string)=>properties.set(k,v)})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},Utilities:{base64Decode:(s:string)=>Buffer.from(s,'base64'),newBlob:(html:string,type:string,name:string)=>({html,type,name})},ContentService:{MimeType:{JSON:'json'},createTextOutput:(value:string)=>({setMimeType:()=>value})}});vm.runInContext(source,context);post=data=>JSON.parse(context.doPost({postData:{contents:JSON.stringify({secret:'test-secret',...(data as object)})}}));
});
const payload={action:'billing-send',key:'11111111-1111-4111-8111-111111111111',from:'klgcr.noreply@gmail.com',to:'account1@keanlenggroup.com',cc:['klgcr.kevin@gmail.com','klgcr.fikri@gmail.com'],subject:'Approved rental',text:'Approved by James',invoiceHtml:'<html>Signed original invoice</html>',fileName:'approved.html'};
it('checks real executor identity and CC capability without sending',()=>{expect(post({action:'billing-capabilities'})).toMatchObject({ok:true,sender:'klgcr.noreply@gmail.com'});expect(send).not.toHaveBeenCalled();owner='other@gmail.com';expect(post({action:'billing-capabilities'}).ok).toBe(false)});
it('sends exact To and CC from the actual noreply account and attaches the original document',()=>{expect(post(payload)).toMatchObject({ok:true,status:'sent',sender:payload.from,to:payload.to,cc:payload.cc});expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0][0]).toMatchObject({to:payload.to,cc:payload.cc.join(','),attachments:[{type:'text/html',name:'approved.html'}]})});
it('deduplicates repeated approval/retry by delivery key',()=>{const first=post(payload);expect(post(payload)).toEqual(first);expect(send).toHaveBeenCalledOnce()});
it('rejects different senders, recipients and CC without delivery',()=>{owner='other@gmail.com';expect(post(payload).status).toBe('rejected');owner=payload.from;expect(post({...payload,cc:[]}).status).toBe('rejected');expect(post({...payload,to:'other@example.com'}).status).toBe('rejected');expect(send).not.toHaveBeenCalled()});
it('does not blindly retry a send whose outcome is uncertain',()=>{send.mockImplementation(()=>{throw Error('interrupted')});expect(post(payload).status).toBe('uncertain');expect(post(payload).status).toBe('uncertain');expect(send).toHaveBeenCalledOnce()});
it('rejects missing/wrong gateway authorization',()=>{expect(post({...payload,secret:'wrong'}).status).toBe('rejected');expect(send).not.toHaveBeenCalled()});
it('preserves old transactional mail requests',()=>{expect(post({to:'resident@example.test',subject:'Update',text:'Details',html:'<p>Details</p>'}).ok).toBe(true);expect(send.mock.calls[0][0]).toMatchObject({to:'resident@example.test',htmlBody:'<p>Details</p>'})});

it('accepts the existing constant without requiring a Script Property',()=>{properties.delete('KLGCR_GMAIL_WEB_APP_SECRET');context.WEBSITE_EMAIL_SECRET='test-secret';expect(post({action:'billing-capabilities'})).toMatchObject({ok:true,sender:'klgcr.noreply@gmail.com'});expect(send).not.toHaveBeenCalled()});

const poPayload={action:'po-send',key:'po_11111111-1111-4111-8111-111111111111_r1',from:payload.from,to:'purchasing@keanlenggroup.com',cc:payload.cc,subject:'Approved PO',text:'James approved',pdfBase64:Buffer.from('%PDF-1.7 signed document').toString('base64'),fileName:'PO-approved.pdf'};
it('sends signed Building Material PDF with exact purchasing To and both CC, once per revision',()=>{
 expect(post({action:'po-capabilities'})).toMatchObject({ok:true,capabilities:['poPdf','cc','idempotency']});expect(send).not.toHaveBeenCalled();
 const first=post(poPayload);expect(first).toMatchObject({status:'sent',to:poPayload.to,cc:payload.cc,sender:payload.from});expect(post(poPayload)).toEqual(first);expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0][0]).toMatchObject({to:poPayload.to,cc:payload.cc.join(','),attachments:[{type:'application/pdf',name:'PO-approved.pdf'}]});
});
it('blocks PO sends with wrong sender, destinations, missing CC or invalid attachment',()=>{
 for(const change of [{from:'other@gmail.com'},{to:payload.to},{cc:[]},{pdfBase64:'invalid'}])expect(post({...poPayload,...change}).status).toBe('rejected');expect(send).not.toHaveBeenCalled();
});
it('does not resend PO when Gmail result is uncertain',()=>{send.mockImplementation(()=>{throw Error('interrupted')});expect(post(poPayload).status).toBe('uncertain');expect(post(poPayload).status).toBe('uncertain');expect(send).toHaveBeenCalledOnce()});
const financePayload={action:'finance-send',key:'receipt_11111111-1111-4111-8111-111111111111',from:payload.from,to:'company@example.com',subject:'Official receipt',text:'Payment received',pdfBase64:Buffer.from('%PDF-1.7 receipt').toString('base64'),fileName:'KLGCR-260001.pdf'};
it('sends a company receipt PDF from noreply once and preserves bank-transfer HTML',()=>{expect(post({...financePayload,html:'<p>Approved</p>'})).toMatchObject({ok:true,status:'sent',to:financePayload.to,sender:payload.from});post(financePayload);expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0][0]).toMatchObject({to:financePayload.to,htmlBody:'<p>Approved</p>',attachments:[{type:'application/pdf'}]});});
it('blocks finance recipient header injection and wrong sender',()=>{expect(post({...financePayload,to:'one@example.com,two@example.com'}).status).toBe('rejected');owner='wrong@gmail.com';expect(post(financePayload).status).toBe('rejected');expect(send).not.toHaveBeenCalled();});
