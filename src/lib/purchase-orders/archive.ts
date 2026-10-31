import { itemBalance } from './balance';
import {createHash} from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { purchaseOrderPdf } from './pdf';
import type { PurchaseOrder } from './schema';
export async function archivedPurchaseOrderPdf(order:PurchaseOrder) {
 const bucket=createAdminClient().storage.from('inventory-po-pdfs');const approval=order.approved_at?new Date(order.approved_at).getTime():'draft';
 const signatureHash=createHash('sha256').update(JSON.stringify([order.requested_signature||null,order.approved_signature||null,order.requested_signed_at||null])).digest('hex').slice(0,16);
 const key=`${order.id}-r${order.revision||1}-${approval}-${signatureHash}-signed-layout-v7-balance.pdf`;
 const prior=await bucket.download(key);if(prior.data)return new Uint8Array(await prior.data.arrayBuffer());
 const db=createAdminClient();
 const selected=await db.from('inventory_items').select('id,balance_qty,stock_group,inventory_group,quantity_unverified').in('id',order.items.map(item=>item.itemId));
 if(selected.error)throw new Error('Unable to load PO stock balances');
 const groups=[...new Set((selected.data||[]).map(item=>item.stock_group).filter((group):group is string=>!!group))];
 const grouped=groups.length?await db.from('inventory_items').select('id,balance_qty,stock_group,inventory_group,quantity_unverified').in('stock_group',groups).eq('is_active',true):{data:[],error:null};
 if(grouped.error)throw new Error('Unable to load grouped stock balances');
 const catalog=[...new Map([...(selected.data||[]),...(grouped.data||[])].map(item=>[item.id,item])).values()];
 const bytes=await purchaseOrderPdf({...order,items:order.items.map(item=>({...item,balanceQty:itemBalance(catalog,item.itemId)}))});
 const saved=await bucket.upload(key,bytes,{contentType:'application/pdf',upsert:false});
 if(saved.error){const retry=await bucket.download(key);if(retry.data)return new Uint8Array(await retry.data.arrayBuffer());throw new Error('PDF archive unavailable');}
 return bytes;
}
