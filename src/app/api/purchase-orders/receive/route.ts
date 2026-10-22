import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { receiveGoodsSchema } from '@/lib/purchase-orders/receipts';
import { syncGoodsReceipt } from '@/lib/purchase-orders/receipt-sync';
export const runtime='nodejs';
export const maxDuration=300;
export async function POST(req:NextRequest){
 const profile=await getSessionProfile();if(profile?.role!=='admin')return NextResponse.json({error:'Access denied'},{status:403});
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Invalid origin'},{status:403});
 try{
  const raw=await req.text();if(raw.length>30000)return NextResponse.json({error:'Request too large'},{status:413});
  const parsed=z.union([receiveGoodsSchema,z.object({action:z.literal('retry_sync'),receiptId:z.string().uuid()})]).safeParse(JSON.parse(raw));
  if(!parsed.success)return NextResponse.json({error:'Enter arrival quantities greater than zero, with up to 2 decimal places.'},{status:400});
  const db=await createClient();let order,receipt;
  if(parsed.data.action==='receive'){
   const result=await db.rpc('receive_inventory_purchase_order',{payload:parsed.data});
   if(result.error)return NextResponse.json({error:result.error.message},{status:409});
   order=result.data.order;receipt=result.data.receipt;
  }else{
   const result=await db.from('inventory_po_receipts').select('*').eq('id',parsed.data.receiptId).single();if(result.error||!result.data)return NextResponse.json({error:'Receipt not found'},{status:404});receipt=result.data;
   const current=await db.from('inventory_purchase_orders').select('*').eq('id',receipt.order_id).single();if(current.error)throw Error('Unable to load PO');order=current.data;
  }
  try{receipt=await syncGoodsReceipt(receipt);}catch{return NextResponse.json({order,receipt,message:'Goods received and stock saved. Google Sheet sync is pending; use Retry Google Sync.'});}
  return NextResponse.json({order,receipt,message:receipt.sheet_status==='synced'?'Goods received. Inventory and Google Sheet are updated.':'Stock saved. Google Sheet sync is pending; use Retry Google Sync.'});
 }catch{return NextResponse.json({error:'Unable to complete this request. Retry the same request to avoid duplicate receiving.'},{status:400});}
}
