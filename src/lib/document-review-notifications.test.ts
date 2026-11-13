import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({events:[] as Record<string,unknown>[],updates:[] as Record<string,unknown>[],filters:[] as unknown[],claim:vi.fn(),push:vi.fn(),readError:null as unknown}));
vi.mock('./supabase/admin',()=>({createAdminClient:()=>({
 from:()=>{const q={select:()=>q,is:()=>q,order:()=>q,limit:()=>q,eq:(...v:unknown[])=>{m.filters.push(v);return q},update:(v:Record<string,unknown>)=>{m.updates.push(v);return q},then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:m.events,error:m.readError}).then(resolve)};return q},
 rpc:m.claim
})}));
vi.mock('./push',()=>({sendPushNotifications:m.push}));
import {dispatchDocumentReviewPushes} from './document-review-notifications';
beforeEach(()=>{vi.clearAllMocks();m.events=[{id:'event',document_id:'doc',recipient_id:'fikri',title:'Requires your verification',body:'Rental',href:'/admin/document-review/billing/doc'}];m.updates=[];m.filters=[];m.readError=null;m.claim.mockResolvedValue({data:true,error:null});m.push.mockResolvedValue(undefined)});
it('pushes only to the assigned reviewer with a stable notification tag',async()=>{
 await dispatchDocumentReviewPushes('doc');
 expect(m.push).toHaveBeenCalledWith(expect.objectContaining({recipientIds:['fikri'],strict:true,requireSubscription:true,tag:'document-review-event'}));
 expect(m.updates[0]).toMatchObject({delivered_at:expect.any(String),locked_until:null,last_error:null});
});
it('claims TM Unifi review alerts through their invoice-specific workflow',async()=>{
 m.events[0].document_type='unifi_invoice';
 await dispatchDocumentReviewPushes('doc');
 expect(m.claim).toHaveBeenCalledWith('claim_unifi_invoice_review_push',{event_id:'event',token:expect.any(String)});
});
it('does not send a superseded or concurrently leased request',async()=>{
 m.claim.mockResolvedValue({data:false,error:null});await dispatchDocumentReviewPushes();expect(m.push).not.toHaveBeenCalled();expect(m.updates).toEqual([]);
});
it('keeps failed phone delivery available for retry',async()=>{
 m.push.mockRejectedValue(Error('Offline'));await dispatchDocumentReviewPushes();
 expect(m.updates[0]).toMatchObject({locked_until:null,last_error:expect.any(String)});expect(m.updates[0]).not.toHaveProperty('delivered_at');
});
it('can retry just the account registering a phone',async()=>{
 await dispatchDocumentReviewPushes(undefined,'kevin');expect(m.filters).toContainEqual(['recipient_id','kevin']);
});
it('does not send if queue lookup fails',async()=>{
 m.readError=Error('DB');await expect(dispatchDocumentReviewPushes()).rejects.toThrow('Unable to load');expect(m.push).not.toHaveBeenCalled();
});
