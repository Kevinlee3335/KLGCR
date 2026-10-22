import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushNotifications } from '@/lib/push';

// Bell notifications are committed in the same transaction as the PO change.
// A leased outbox lets retries deliver phone alerts without repeating a save/approval.
export async function dispatchPoNotifications(orderId?:string) {
 const db=createAdminClient();
 let query=db.from('inventory_po_notification_outbox').select('*').is('delivered_at',null).order('created_at').limit(30);
 if(orderId)query=query.eq('order_id',orderId);
 const {data,error}=await query;if(error)throw Error(error.message);
 for(const event of data||[]){
  const token=crypto.randomUUID();const claim=await db.rpc('claim_po_notification',{event_id:event.id,token});
  if(claim.error)throw Error(claim.error.message);if(!claim.data)continue;
  try{
   const profile=await db.from('profiles').select('id').eq('id',event.recipient_id).eq('is_active',true).is('deleted_at',null).maybeSingle();
   if(profile.error)throw Error(profile.error.message);
   const newer=await db.from('inventory_po_notification_outbox').select('id').eq('order_id',event.order_id).gt('revision',event.revision).limit(1);
   if(newer.error)throw Error(newer.error.message);
   if(profile.data&&!newer.data?.length)await sendPushNotifications({recipientIds:[event.recipient_id],title:event.title,body:event.body,href:event.href,strict:true});
   const update=await db.from('inventory_po_notification_outbox').update({delivered_at:new Date().toISOString(),locked_until:null}).eq('id',event.id).eq('claim_token',token);
   if(update.error)throw Error(update.error.message);
  }catch(error){
   await db.from('inventory_po_notification_outbox').update({locked_until:null}).eq('id',event.id).eq('claim_token',token);
   console.error('PO phone notification deferred',error);
  }
 }
}
