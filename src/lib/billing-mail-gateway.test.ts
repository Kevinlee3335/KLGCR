// @vitest-environment node
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {beforeEach,it,expect,vi} from 'vitest';
const source=readFileSync('public/billing-mail/gateway.gs','utf8');
let owner:string,properties:Map<string,string>,send:ReturnType<typeof vi.fn>,post:(data:unknown)=>Record<string,unknown>;
beforeEach(()=>{
 owner='klgcr.noreply@gmail.com';properties=new Map([['KLGCR_GMAIL_WEB_APP_SECRET','test-secret']]);send=vi.fn();
 const context=vm.createContext({Session:{getEffectiveUser:()=>({getEmail:()=>owner})},MailApp:{sendEmail:send,getRemainingDailyQuota:()=>100},PropertiesService:{getScriptProperties:()=>({getProperty:(k:string)=>properties.get(k),setProperty:(k:string,v:string)=>properties.set(k,v)})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},Utilities:{newBlob:(html:string,type:string,name:string)=>({html,type,name})},ContentService:{MimeType:{JSON:'json'},createTextOutput:(value:string)=>({setMimeType:()=>value})}});vm.runInContext(source,context);post=data=>JSON.parse(context.doPost({postData:{contents:JSON.stringify({secret:'test-secret',...(data as object)})}}));
});
const payload={action:'billing-send',key:'11111111-1111-4111-8111-111111111111',from:'klgcr.noreply@gmail.com',to:'account1@keanlenggroup.com',cc:['klgcr.kevin@gmail.com','klgcr.fikri@gmail.com'],subject:'Approved rental',text:'Approved by James',invoiceHtml:'<html>Signed original invoice</html>',fileName:'approved.html'};
it('checks real executor identity and CC capability without sending',()=>{expect(post({action:'billing-capabilities'})).toMatchObject({ok:true,sender:'klgcr.noreply@gmail.com'});expect(send).not.toHaveBeenCalled();owner='other@gmail.com';expect(post({action:'billing-capabilities'}).ok).toBe(false)});
it('sends exact To and CC from the actual noreply account and attaches the original document',()=>{expect(post(payload)).toMatchObject({ok:true,status:'sent',sender:payload.from,to:payload.to,cc:payload.cc});expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0][0]).toMatchObject({to:payload.to,cc:payload.cc.join(','),attachments:[{type:'text/html',name:'approved.html'}]})});
it('deduplicates repeated approval/retry by delivery key',()=>{const first=post(payload);expect(post(payload)).toEqual(first);expect(send).toHaveBeenCalledOnce()});
it('rejects different senders, recipients and CC without delivery',()=>{owner='other@gmail.com';expect(post(payload).status).toBe('rejected');owner=payload.from;expect(post({...payload,cc:[]}).status).toBe('rejected');expect(post({...payload,to:'other@example.com'}).status).toBe('rejected');expect(send).not.toHaveBeenCalled()});
it('does not blindly retry a send whose outcome is uncertain',()=>{send.mockImplementation(()=>{throw Error('interrupted')});expect(post(payload).status).toBe('uncertain');expect(post(payload).status).toBe('uncertain');expect(send).toHaveBeenCalledOnce()});
it('rejects missing/wrong gateway authorization',()=>{expect(post({...payload,secret:'wrong'}).status).toBe('rejected');expect(send).not.toHaveBeenCalled()});
it('preserves old transactional mail requests',()=>{expect(post({to:'resident@example.test',subject:'Update',text:'Details',html:'<p>Details</p>'}).ok).toBe(true);expect(send.mock.calls[0][0]).toMatchObject({to:'resident@example.test',htmlBody:'<p>Details</p>'})});
