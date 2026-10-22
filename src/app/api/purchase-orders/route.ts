import { NextRequest, NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { purchaseOrderSchema } from '@/lib/purchase-orders/schema';
import { archivedPurchaseOrderPdf } from '@/lib/purchase-orders/archive';
export const runtime='nodejs';
export async function POST(req: NextRequest) {
  const profile=await getSessionProfile();
  if(profile?.role!=='admin') return NextResponse.json({error:'Access denied'},{status:403});
  if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Invalid origin'},{status:403});
  try {
    const raw=await req.text();if(raw.length>100000)return NextResponse.json({error:'Request too large'},{status:413});
    const parsed=purchaseOrderSchema.safeParse(JSON.parse(raw));
    if(!parsed.success)return NextResponse.json({error:'Please select inventory items, enter a date, requester and positive quantities.'},{status:400});
    const db=await createClient();
    const {data,error}=await db.rpc(parsed.data.orderId?'edit_inventory_purchase_order':'save_inventory_purchase_order',{payload:parsed.data});
    if(error?.message.includes('changed by another'))return NextResponse.json({error:'This PO was changed by another user. Refresh the page and reopen the latest PO before editing.'},{status:409});
    if(error){console.error('PO save:',error.message);return NextResponse.json({error:'Unable to save PO. Please retry; the same request will not create a duplicate.'},{status:503});}
    await archivedPurchaseOrderPdf(data);
    return NextResponse.json({order:data});
  }catch{return NextResponse.json({error:'Unable to save PO. Please check the details and retry.'},{status:400});}
}
