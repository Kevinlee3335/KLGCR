// @vitest-environment node
import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({gateway:vi.fn(),pdf:vi.fn(),email:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:mocks.from})}));
vi.mock('@/lib/billing-mail',()=>({gmailGateway:mocks.gateway}));
vi.mock('./archive',()=>({archivedPurchaseOrderPdf:mocks.pdf}));
vi.mock('@/lib/email',()=>({sendTransactionalEmail:mocks.email}));
vi.mock('@/lib/push',()=>({sendPushNotifications:vi.fn()}));
import {dispatchApprovedPurchase} from './dispatch';
const id='11111111-1111-4111-8111-111111111111',cc=['klgcr.kevin@gmail.com','klgcr.fikri@gmail.com'];
let order:Record<string,unknown>,event:Record<string,unknown>,updates:Record<string,unknown>[];
beforeEach(()=>{
 vi.clearAllMocks();updates=[];
 order={id,revision:1,approved_at:'2026-10-28T01:00:00Z',approved_by:'James',approved_by_user:'eeab5f04-30c3-42bd-a095-58e56c814358',approved_signature:{strokes:[[[0,0],[1,1]]]},items:[],po_no:'PO-1'};
 event={order_id:id,revision:1,inventory_group:'building',recipient:'purchasing@keanlenggroup.com',recipient_ids:[],status:'pending'};
 mocks.from.mockImplementation((table:string)=>{
  let update:Record<string,unknown>|undefined;
  const builder:Record<string,unknown>={};
  for(const method of ['select','eq'])builder[method]=()=>builder;
  builder.update=(v:Record<string,unknown>)=>{update=v;updates.push(v);return builder;};
  const response=()=>({data:table==='inventory_purchase_orders'?order:table==='inventory_procurement_routes'?{channel:'email',recipient:event.recipient,recipient_ids:[]}:update?.status==='sending'?event:event.status==='pending'?event:null,error:null});
  builder.single=builder.maybeSingle=async()=>response();
  builder.then=(resolve:(v:unknown)=>unknown)=>Promise.resolve(response()).then(resolve);
  return builder;
 });
 mocks.pdf.mockResolvedValue(Buffer.from('%PDF-1.7 signed'));
 mocks.gateway.mockImplementation(async(p:Record<string,unknown>)=>p.action==='po-capabilities'?{ok:true,sender:'klgcr.noreply@gmail.com',capabilities:['poPdf','cc','idempotency']}:{ok:true,status:'sent',key:p.key,sender:p.from,to:p.to,cc:p.cc,sentAt:'2026-10-28T01:01:00Z'});
});
it('sends signed PDF only to purchasing with both CC and records a verified receipt',async()=>{
 await dispatchApprovedPurchase(id,1,'https://example.test');
 expect(mocks.gateway).toHaveBeenLastCalledWith(expect.objectContaining({action:'po-send',to:'purchasing@keanlenggroup.com',cc,from:'klgcr.noreply@gmail.com',pdfBase64:Buffer.from('%PDF-1.7 signed').toString('base64')}),20000);
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
it('does not report sent if the gateway drops CC',async()=>{
 mocks.gateway.mockImplementation(async(p:Record<string,unknown>)=>p.action==='po-capabilities'?{ok:true,sender:'klgcr.noreply@gmail.com',capabilities:['poPdf','cc','idempotency']}:{ok:true,status:'sent',key:p.key,sender:p.from,to:p.to,cc:[],sentAt:'2026-10-28T01:01:00Z'});
 await dispatchApprovedPurchase(id,1,'https://example.test');expect(updates.at(-1)).toMatchObject({status:'failed'});
});
it('does not resend an already claimed or sent PO',async()=>{event.status='sent';await dispatchApprovedPurchase(id,1,'https://example.test');expect(mocks.gateway).not.toHaveBeenCalled();});
