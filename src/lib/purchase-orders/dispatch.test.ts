// @vitest-environment node
import {beforeEach,it,expect,vi} from 'vitest';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const mocks=vi.hoisted(()=>({gateway:vi.fn(),pdf:vi.fn(),email:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:mocks.from})}));
vi.mock('@/lib/billing-mail',()=>({gmailGateway:mocks.gateway}));
vi.mock('./archive',()=>({archivedPurchaseOrderPdf:mocks.pdf}));
vi.mock('@/lib/email',()=>({sendTransactionalEmail:mocks.email}));
vi.mock('@/lib/push',()=>({sendPushNotifications:vi.fn()}));
import {dispatchApprovedPurchase} from './dispatch';
const id='11111111-1111-4111-8111-111111111111';
let order:Record<string,unknown>,event:Record<string,unknown>,updates:Record<string,unknown>[],readError:unknown;
beforeEach(()=>{
 vi.clearAllMocks();updates=[];readError=null;
 order={id,revision:1,approved_at:'2026-10-28T01:00:00Z',approved_by:'James',approved_by_user:'eeab5f04-30c3-42bd-a095-58e56c814358',approved_signature:{strokes:[[[0,0],[1,1]]]},items:[],po_no:'PO-1'};
 event={order_id:id,revision:1,inventory_group:'building',recipient:'purchasing@keanlenggroup.com',recipient_ids:[],status:'pending'};
 mocks.from.mockImplementation((table:string)=>{
  let update:Record<string,unknown>|undefined;
  const builder:Record<string,unknown>={};
  for(const method of ['select','eq'])builder[method]=()=>builder;
  builder.update=(v:Record<string,unknown>)=>{update=v;updates.push(v);return builder;};
  const response=()=>({data:table==='inventory_purchase_orders'?order:table==='inventory_procurement_routes'?{channel:'email',recipient:event.recipient,recipient_ids:[]}:update?.status==='sending'?event:event.status==='pending'?event:null,error:table==='inventory_purchase_orders'?readError:null});
  builder.single=builder.maybeSingle=async()=>response();
  builder.then=(resolve:(v:unknown)=>unknown)=>Promise.resolve(response()).then(resolve);
  return builder;
 });
 mocks.pdf.mockResolvedValue(Buffer.from('%PDF-1.7 signed'));
 mocks.gateway.mockImplementation(async(p:Record<string,unknown>)=>p.action==='finance-capabilities'?{ok:true,sender:'klgcr.noreply@gmail.com',capabilities:['financePdf','idempotency']}:{ok:true,status:'sent',key:p.key,sender:p.from,to:p.to,cc:p.cc,sentAt:'2026-10-28T01:01:00Z'});
});
it('records a permission failure without claiming or sending the approved PO',async()=>{
 readError={code:'42501',message:'permission denied for table inventory_purchase_orders'};
 await expect(dispatchApprovedPurchase(id,1,'https://example.test')).rejects.toThrow('could not read the approved PO');
 expect(updates).toEqual([{error:'Email pending: the delivery service could not read the approved PO.'}]);
 expect(mocks.gateway).not.toHaveBeenCalled();expect(mocks.pdf).not.toHaveBeenCalled();
});
it('sends signed PDF only to purchasing without CC and records a verified receipt',async()=>{
 await dispatchApprovedPurchase(id,1,'https://example.test');
 expect(mocks.gateway).toHaveBeenLastCalledWith(expect.objectContaining({action:'finance-send',to:'purchasing@keanlenggroup.com',cc:[],from:'klgcr.noreply@gmail.com',pdfBase64:Buffer.from('%PDF-1.7 signed').toString('base64')}),20000);
 expect(updates.at(-1)).toMatchObject({status:'sent',error:null});expect(mocks.email).not.toHaveBeenCalled();
});
it.each(['unsigned','wrong_approver','stale','unapproved'])('blocks %s approval before any mail',async(mode)=>{
 if(mode==='unsigned')order.approved_signature=null;
 if(mode==='wrong_approver')order.approved_by_user='someone-else';
 if(mode==='stale')order.revision=2;
 if(mode==='unapproved')order.approved_at=null;
 await dispatchApprovedPurchase(id,1,'https://example.test');expect(mocks.gateway).not.toHaveBeenCalled();expect(updates).toEqual([]);
});
it('keeps pending and does not send through an older gateway',async()=>{
 mocks.gateway.mockResolvedValue({ok:true});await dispatchApprovedPurchase(id,1,'https://example.test');expect(mocks.gateway).toHaveBeenCalledOnce();expect(updates).toEqual([expect.objectContaining({error:expect.stringContaining('not connected')})]);
});
it('does not report sent if the gateway unexpectedly adds CC',async()=>{
 mocks.gateway.mockImplementation(async(p:Record<string,unknown>)=>p.action==='finance-capabilities'?{ok:true,sender:'klgcr.noreply@gmail.com',capabilities:['financePdf','idempotency']}:{ok:true,status:'sent',key:p.key,sender:p.from,to:p.to,cc:['unexpected@example.test'],sentAt:'2026-10-28T01:01:00Z'});
 await dispatchApprovedPurchase(id,1,'https://example.test');expect(updates.at(-1)).toMatchObject({status:'failed'});
});
it('does not resend an already claimed or sent PO',async()=>{event.status='sent';await dispatchApprovedPurchase(id,1,'https://example.test');expect(mocks.gateway).not.toHaveBeenCalled();});
it('sends Office PDF with approved company wording after Mary approval',async()=>{
 event.inventory_group='office';event.recipient='khet_loong@yahoo.com';
 order.approved_by='Mary';order.approved_by_user='1767d3e4-c907-45fe-8ed0-e433c0d0dca7';
 mocks.gateway.mockImplementation(async(p:Record<string,unknown>)=>p.action==='po-capabilities'?{ok:true,sender:'klgcr.noreply@gmail.com',capabilities:['poPdf','officePoPdf','cc','idempotency']}:{ok:true,status:'sent',key:p.key,sender:p.from,to:p.to,cc:p.cc,sentAt:'2026-10-29T01:01:00Z'});
 await dispatchApprovedPurchase(id,1,'https://example.test');
 expect(mocks.gateway).toHaveBeenLastCalledWith(expect.objectContaining({to:'khet_loong@yahoo.com',cc:[],subject:'Purchase Order PO-1 – Office Supplies | K HOTEL SDN BHD',text:expect.stringContaining('K HOTEL SDN BHD (KLG Campus Residence)'),pdfBase64:expect.any(String)}),20000);
 expect(updates.at(-1)).toMatchObject({status:'sent'});
});
it('keeps Office mail pending until the gateway supports Office PDF delivery',async()=>{
 event.inventory_group='office';event.recipient='khet_loong@yahoo.com';order.approved_by_user='1767d3e4-c907-45fe-8ed0-e433c0d0dca7';
 await dispatchApprovedPurchase(id,1,'https://example.test');
 expect(mocks.gateway).toHaveBeenCalledOnce();expect(updates).toEqual([expect.objectContaining({error:expect.stringContaining('not connected')})]);
});

it('uses the deployed PDF gateway to send once without CC and separates PO revisions',async()=>{
 const sent=vi.fn(),properties=new Map<string,string>([['KLGCR_GMAIL_WEB_APP_SECRET','test-secret']]);
 const context=vm.createContext({Session:{getEffectiveUser:()=>({getEmail:()=> 'klgcr.noreply@gmail.com'})},MailApp:{sendEmail:sent,getRemainingDailyQuota:()=>100},PropertiesService:{getScriptProperties:()=>({getProperty:(k:string)=>properties.get(k),setProperty:(k:string,v:string)=>properties.set(k,v)})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},Utilities:{base64Decode:(s:string)=>Buffer.from(s,'base64'),newBlob:(data:unknown,type:string,name:string)=>({data,type,name})},ContentService:{MimeType:{JSON:'json'},createTextOutput:(value:string)=>({setMimeType:()=>value})}});
 vm.runInContext(readFileSync('public/billing-mail/gateway.gs','utf8'),context);
 mocks.gateway.mockImplementation(async(p:Record<string,unknown>)=>JSON.parse(context.doPost({postData:{contents:JSON.stringify({...p,secret:'test-secret'})}})));
 await dispatchApprovedPurchase(id,1,'https://example.test');
 await dispatchApprovedPurchase(id,1,'https://example.test');
 expect(sent).toHaveBeenCalledOnce();
 expect(sent.mock.calls[0][0]).toMatchObject({to:'purchasing@keanlenggroup.com',attachments:[{type:'application/pdf'}]});
 expect(sent.mock.calls[0][0]).not.toHaveProperty('cc');expect(sent.mock.calls[0][0]).not.toHaveProperty('bcc');
 expect(updates.at(-1)).toMatchObject({status:'sent'});
 order.revision=2;event.revision=2;
 await dispatchApprovedPurchase(id,2,'https://example.test');
 expect(sent).toHaveBeenCalledTimes(2);
});
