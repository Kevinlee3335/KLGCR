import { NextRequest,NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { pushInventoryItemToGoogle } from '@/lib/inventory-google-sync';
export const runtime='nodejs';export const maxDuration=120;
export async function POST(req:NextRequest){
 if(Date.now()>Date.parse("2026-10-22T04:14:49.515172+00:00")||createHash('sha256').update(req.headers.get('x-cleanup-token')||'').digest('hex')!=="bee5488bbe763f498a9c407d3f2770c6631237d45d76e02d2a792efbe7f96212")return new NextResponse('Access denied',{status:403});
 const db=createAdminClient();const orderId='00836e84-89ee-44d8-b957-8cbb491e155c',itemId='3c47bd18-feb7-420a-99ed-e64c7d62a7f0',receiptId='408bc92c-a9dc-436a-8418-6cc65727b6fd';
 try{
 const order=await db.from('inventory_purchase_orders').select('po_no').eq('id',orderId).maybeSingle();if(order.error)throw Error('PO unavailable');if(!order.data)return NextResponse.json({ok:true,alreadyCleared:true});
 if(order.data.po_no!=='KH/KLG/PO/2026-0030')throw Error('Wrong test PO');
 const others=await db.from('inventory_purchase_orders').select('id').neq('id',orderId).gte('po_no','KH/KLG/PO/2026-0030');if(others.error||others.data.length)throw Error('Other orders exist; numbering cannot be reset');
 const history=await db.from('inventory_adjustment_history').select('qty,balance_before,balance_after,note').eq('id',18).maybeSingle();if(history.error)throw Error('History unavailable');
 const pending=await db.from('inventory_po_receipts').update({sheet_status:'pending',sheet_error:'Removing authorized test delivery'}).eq('id',receiptId).eq('order_id',orderId);if(pending.error)throw Error('Could not protect stock during cleanup');
 if(history.data){
  if(Number(history.data.qty)!==10||Number(history.data.balance_before)!==43||Number(history.data.balance_after)!==53||history.data.note!=='PO KH/KLG/PO/2026-0030 receipt 0df5f31d-789c-497c-baf1-eb8ffeac7b6a')throw Error('Unexpected test adjustment');
  const current=await db.from('inventory_items').select('balance_qty').eq('id',itemId).single();if(current.error)throw Error('Stock unavailable');
  if(Number(current.data.balance_qty)===53){const changed=await db.from('inventory_items').update({balance_qty:43}).eq('id',itemId).eq('balance_qty',53).select('id');if(changed.error||changed.data.length!==1)throw Error('Stock changed; retry');}
  else if(Number(current.data.balance_qty)!==43)throw Error('Stock changed since test; cleanup stopped');
  const removed=await db.from('inventory_adjustment_history').delete().eq('id',18);if(removed.error)throw Error('History cleanup failed');
 }
 const item=await db.from('inventory_items').select('item_code,description,category,movement_category,balance_qty,reorder_level,unit').eq('id',itemId).single();if(item.error||Number(item.data.balance_qty)!==43)throw Error('Unexpected restored stock');
 const pushed=await pushInventoryItemToGoogle(item.data);if(pushed.skipped||!pushed.ok)throw Error('Google Sheet rollback failed');
 const bucket=db.storage.from('inventory-po-pdfs');const files=await bucket.list('',{search:orderId});if(files.error)throw Error('Archive listing failed');
 const names=(files.data||[]).filter(f=>f.name.startsWith(orderId)).map(f=>f.name);if(names.length){const deleted=await bucket.remove(names);if(deleted.error)throw Error('Archive cleanup failed');}
 for(const table of ['inventory_po_receipts','inventory_po_revisions']){const deleted=await db.from(table).delete().eq('order_id',orderId);if(deleted.error)throw Error(table+' cleanup failed');}
 const deleted=await db.from('inventory_purchase_orders').delete().eq('id',orderId);if(deleted.error)throw Error('PO cleanup failed');
 const counter=await db.from('inventory_po_counters').update({last_number:29}).eq('year',2026).eq('last_number',30).select('year');if(counter.error||counter.data.length!==1)throw Error('Counter reset failed');
 return NextResponse.json({ok:true,balance:43,googleSynced:true,pdfsRemoved:names.length,nextPo:'KH/KLG/PO/2026-0030'});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Cleanup failed'},{status:503});}
}
