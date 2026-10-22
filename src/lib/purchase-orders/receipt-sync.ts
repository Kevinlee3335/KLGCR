import { createAdminClient } from '@/lib/supabase/admin';
import { pushInventoryItemToGoogle } from '@/lib/inventory-google-sync';
import type { GoodsReceipt } from './receipts';
export async function syncGoodsReceipt(receipt:GoodsReceipt){
 if(receipt.sheet_status==='synced')return receipt;
 const db=createAdminClient();let failure='';
 for(const line of receipt.items){
  const token=crypto.randomUUID();const lock=await db.rpc('claim_po_sheet_item',{p_item_id:line.itemId,p_token:token});
  if(lock.error||!lock.data){failure='Another stock sync is running. Retry shortly.';continue;}
  try{
   let ok=false;
   for(let attempt=0;attempt<3;attempt++){
    const item=await db.from('inventory_items').select('item_code,description,category,movement_category,balance_qty,reorder_level,unit,updated_at').eq('id',line.itemId).single();
    if(item.error||!item.data)throw Error('Inventory item unavailable');
    const pushed=await pushInventoryItemToGoogle(item.data);
    if(pushed.skipped)throw Error('Google Sheet sync is not configured. Stock is saved; retry after connecting.');
    if(!pushed.ok)throw Error('Google Sheet update failed. Stock is saved; retry sync.');
    const latest=await db.from('inventory_items').select('balance_qty,updated_at').eq('id',line.itemId).single();
    if(!latest.error&&latest.data?.updated_at===item.data.updated_at&&Number(latest.data.balance_qty)===Number(item.data.balance_qty)){ok=true;break;}
   }
   if(!ok)throw Error('Stock changed during sync. Retry sync to send the latest balance.');
  }catch(e){failure=e instanceof Error?e.message:'Google Sheet sync failed';break;}
  finally{await db.from('inventory_po_sheet_leases').update({locked_until:null,token:null}).eq('item_id',line.itemId).eq('token',token);}
 }
 const result=await db.from('inventory_po_receipts').update({sheet_status:failure?'failed':'synced',sheet_error:failure||null,synced_at:failure?null:new Date().toISOString()}).eq('id',receipt.id).select('*').single();
 if(result.error)throw Error('Stock is saved, but sync status could not be saved. Retry sync.');
 return result.data as GoodsReceipt;
}
