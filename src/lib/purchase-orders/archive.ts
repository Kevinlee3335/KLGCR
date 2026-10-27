import {createHash} from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { purchaseOrderPdf } from './pdf';
import type { PurchaseOrder } from './schema';
export async function archivedPurchaseOrderPdf(order:PurchaseOrder) {
 const bucket=createAdminClient().storage.from('inventory-po-pdfs');const approval=order.approved_at?new Date(order.approved_at).getTime():'draft';
 const signatureHash=createHash('sha256').update(JSON.stringify([order.requested_signature||null,order.approved_signature||null,order.requested_signed_at||null])).digest('hex').slice(0,16);
 const key=`${order.id}-r${order.revision||1}-${approval}-${signatureHash}-signed-v4.pdf`;
 const prior=await bucket.download(key);if(prior.data)return new Uint8Array(await prior.data.arrayBuffer());
 const bytes=await purchaseOrderPdf(order);
 const saved=await bucket.upload(key,bytes,{contentType:'application/pdf',upsert:false});
 if(saved.error){const retry=await bucket.download(key);if(retry.data)return new Uint8Array(await retry.data.arrayBuffer());throw new Error('PDF archive unavailable');}
 return bytes;
}
