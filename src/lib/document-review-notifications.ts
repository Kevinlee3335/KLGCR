import {createAdminClient} from './supabase/admin';
import {sendPushNotifications} from './push';

// Database triggers queue a bell alert and one phone delivery per review stage.
// Leases prevent duplicate submissions; failed pushes remain available for retry.
export async function dispatchDocumentReviewPushes(documentId?:string,recipientId?:string){
 const db=createAdminClient();
 let query=db.from('document_review_push_outbox').select('*').is('delivered_at',null).order('created_at').limit(30);
 if(documentId)query=query.eq('document_id',documentId);
 if(recipientId)query=query.eq('recipient_id',recipientId);
 const due=await query;
 if(due.error)throw Error('Unable to load document phone notifications');
 for(const event of due.data||[]){
  const token=crypto.randomUUID();
  const claim=await db.rpc(event.document_type==='compliance'?'claim_compliance_review_push':'claim_document_review_push',{event_id:event.id,token});
  if(claim.error)throw Error('Unable to claim document phone notification');
  if(!claim.data)continue;
  try{
   await sendPushNotifications({recipientIds:[event.recipient_id],title:event.title,body:event.body,href:event.href,strict:true,requireSubscription:true,tag:'document-review-'+event.id});
   const saved=await db.from('document_review_push_outbox').update({delivered_at:new Date().toISOString(),locked_until:null,last_error:null}).eq('id',event.id).eq('claim_token',token);
   if(saved.error)throw Error('Unable to record phone delivery');
  }catch{
   const retry=await db.from('document_review_push_outbox').update({locked_until:null,last_error:'Phone delivery pending; check subscription or retry.'}).eq('id',event.id).eq('claim_token',token);
   if(retry.error)console.error('Unable to release document phone notification lease');
  }
 }
}
