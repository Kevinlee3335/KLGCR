import {createAdminClient} from '@/lib/supabase/admin';
import {sendTransactionalEmail} from '@/lib/email';
import {sendPushNotifications} from '@/lib/push';

// Claim once. Failed/uncertain sends require review, preventing duplicate purchase emails.
export async function dispatchApprovedPurchase(orderId:string,revision:number,origin:string){
 const db=createAdminClient();
 const current=await db.from('inventory_purchase_orders').select('id,revision,approved_at,po_no,approved_by,items').eq('id',orderId).single();
 if(current.error||!current.data?.approved_at||current.data.revision!==revision)return;
 const queued=await db.from('inventory_po_dispatch').select('*').eq('order_id',orderId).eq('revision',revision).eq('status','pending').maybeSingle();
 if(queued.error||!queued.data)return;
 const event=queued.data;
 const route=await db.from('inventory_procurement_routes').select('recipient,recipient_ids,channel').eq('inventory_group',event.inventory_group).eq('confirmed',true).maybeSingle();
 if(route.error||!route.data)return;
 const destination=route.data;
 if(destination.recipient!==event.recipient || JSON.stringify(destination.recipient_ids)!==JSON.stringify(event.recipient_ids))return;
 // A destination must be explicitly confirmed; personal emails are never inferred.
 if(destination.channel==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination.recipient))return;
 const claim=await db.from('inventory_po_dispatch').update({status:'sending'}).eq('order_id',orderId).eq('revision',revision).eq('status','pending').select('*').maybeSingle();
 if(claim.error||!claim.data)return;
 const order=current.data;
 let sent=false,error:string|null=null;
 try{
  if(destination.channel==='notification'){
   const recipientIds=[...new Set<string>(destination.recipient_ids||[])];
   if(!recipientIds.length)throw Error('No confirmed notification accounts');
   const profile=await db.from('profiles').select('id').in('id',recipientIds).eq('is_active',true).is('deleted_at',null);
   if(profile.error||profile.data?.length!==recipientIds.length)throw Error('Confirmed notification account is unavailable');
   const title='Cleaner supplies approved',body=`${order.po_no} was approved by ${order.approved_by}.`,href=`/admin/inventory/purchase-orders?po=${orderId}`;
   const notification=await db.from('app_notifications').insert(recipientIds.map(recipient_id=>({recipient_id,type:'po_approved',title,body,href,entity_id:orderId})));
   if(notification.error)throw Error('Unable to create notification');
   sent=true;
   await sendPushNotifications({recipientIds,title,body,href}).catch(()=>{});
  }else{
   const result=await sendTransactionalEmail(destination.recipient,{
    subject:`Approved Purchase Order ${order.po_no} — KLGCR`,
    text:`Purchase Order: ${order.po_no}\nApproved by: ${order.approved_by}\n\n${order.items.map((i:{code:string;description:string;quantity:number;unit:string})=>`${i.code} — ${i.description}: ${i.quantity} ${i.unit}`).join('\n')}\n\nApproved PDF (KLGCR sign-in required): ${origin}/api/purchase-orders/${orderId}/pdf`,
   },{timeoutMs:15000});
   sent=result.sent;error=result.sent?null:result.reason;
  }
 }catch{error='Delivery requires review';}
 const update=await db.from('inventory_po_dispatch').update({status:sent?'sent':'failed',sent_at:sent?new Date().toISOString():null,error}).eq('order_id',orderId).eq('revision',revision).eq('status','sending');
 if(update.error)console.error('Purchase delivery status needs review',orderId,revision);
}
