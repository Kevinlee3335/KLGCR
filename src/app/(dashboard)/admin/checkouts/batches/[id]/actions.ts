'use server';
import {requireRole} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {isUUID} from '@/lib/checkout-inspection';
import {pushInventoryItemToGoogle} from '@/lib/inventory-google-sync';
export async function returnBatchMaterial(batchId:string,form:FormData){await requireRole(['admin']);if(!isUUID(batchId))throw new Error('Invalid batch');const db=await createClient(),qty=Number(form.get('quantity')),source=String(form.get('source')),sourceId=Number(form.get('sourceId')),returnId=String(form.get('returnId')),name=String(form.get('returnedBy')||'').trim(),note=String(form.get('note')||'').trim();let error='';
 if(!isUUID(returnId)||!Number.isSafeInteger(sourceId)||sourceId<1||!['issue','stockout'].includes(source)||!Number.isFinite(qty)||qty<=0||Math.abs(qty*100-Math.round(qty*100))>.000001||!name||!note)error='Enter a valid quantity, returner and reason';
 else {const result=await db.rpc('return_checkout_material',{p_id:returnId,p_batch_id:batchId,p_source:source,p_source_id:sourceId,p_qty:qty,p_returned_by:name,p_note:note});if(result.error)error=result.error.message;else {const {data:row}=await db.from('checkout_material_returns').select('inventory_item_id').eq('id',returnId).single();if(row){const {data:item}=await db.from('inventory_items').select('item_code,description,category,movement_category,balance_qty,reorder_level,unit').eq('id',row.inventory_item_id).single();if(item){const sync=await pushInventoryItemToGoogle(item);if(!sync.skipped&&!sync.ok)error='Return saved; Google Sheet sync failed. Do not enter the return again.';}}}}
 revalidatePath('/admin/checkouts/batches/'+batchId);revalidatePath('/admin/inventory');redirect('/admin/checkouts/batches/'+batchId+(error?'?error='+encodeURIComponent(error):'?returned=1'));
}
