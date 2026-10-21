import { createAdminClient } from '@/lib/supabase/admin';
import { purchaseOrderPdf } from './pdf';
import type { PurchaseOrder } from './schema';
export async function archivedPurchaseOrderPdf(order:PurchaseOrder) {
 const bucket=createAdminClient().storage.from('inventory-po-pdfs');const key=`${order.id}.pdf`;
 const prior=await bucket.download(key);if(prior.data)return new Uint8Array(await prior.data.arrayBuffer());
 const bytes=await purchaseOrderPdf(order);
 const saved=await bucket.upload(key,bytes,{contentType:'application/pdf',upsert:false});
 if(saved.error){const retry=await bucket.download(key);if(retry.data)return new Uint8Array(await retry.data.arrayBuffer());throw new Error('PDF archive unavailable');}
 return bytes;
}
