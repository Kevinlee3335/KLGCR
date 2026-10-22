import { NextRequest,NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { pushInventoryItemToGoogle } from '@/lib/inventory-google-sync';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 if(Date.now()>Date.parse("2026-10-22T04:14:49.515172+00:00")||createHash('sha256').update(req.headers.get('x-cleanup-token')||'').digest('hex')!=="bee5488bbe763f498a9c407d3f2770c6631237d45d76e02d2a792efbe7f96212")return new NextResponse('Access denied',{status:403});
 const db=createAdminClient();
 const receipt=await db.from('inventory_po_receipts').select('sheet_status').eq('id','408bc92c-a9dc-436a-8418-6cc65727b6fd').eq('order_id','00836e84-89ee-44d8-b957-8cbb491e155c').single();
 if(receipt.error||receipt.data.sheet_status!=='pending')return new NextResponse('Cleanup not staged',{status:409});
 const history=await db.from('inventory_adjustment_history').select('id').eq('id',18);
 if(history.error||history.data.length)return new NextResponse('Stock rollback not staged',{status:409});
 const item=await db.from('inventory_items').select('item_code,description,category,movement_category,balance_qty,reorder_level,unit').eq('id','3c47bd18-feb7-420a-99ed-e64c7d62a7f0').single();
 if(item.error)return new NextResponse('Inventory unavailable',{status:503});
 const pushed=await pushInventoryItemToGoogle(item.data);
 if(pushed.skipped||!pushed.ok)return NextResponse.json({error:'Google Sheet rollback failed'},{status:503});
 const bucket=db.storage.from('inventory-po-pdfs');const files=await bucket.list('',{search:'00836e84-89ee-44d8-b957-8cbb491e155c'});
 if(files.error)return new NextResponse('Archive listing failed',{status:503});
 const names=(files.data||[]).filter(f=>f.name.startsWith('00836e84-89ee-44d8-b957-8cbb491e155c')).map(f=>f.name);
 if(names.length){const deleted=await bucket.remove(names);if(deleted.error)return new NextResponse('Archive cleanup failed',{status:503});}
 return NextResponse.json({ok:true,balance:Number(item.data.balance_qty),googleSynced:true,pdfsRemoved:names.length});
}
