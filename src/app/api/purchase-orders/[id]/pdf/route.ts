import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { archivedPurchaseOrderPdf } from '@/lib/purchase-orders/archive';
import type { PurchaseOrder } from '@/lib/purchase-orders/schema';
export const runtime='nodejs';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}) {
  const p=await getSessionProfile();
  if(!p||!['admin','management_viewer'].includes(p.role))return new NextResponse('Access denied',{status:403});
  const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return new NextResponse('Not found',{status:404});
  const db=await createClient();const {data,error}=await db.from('inventory_purchase_orders').select('*').eq('id',id).maybeSingle();
  if(error)return new NextResponse('Unable to load PO',{status:503});
  if(!data)return new NextResponse('Not found',{status:404});
  const bytes=await archivedPurchaseOrderPdf(data as PurchaseOrder);
  return new NextResponse(Buffer.from(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${data.po_no.replaceAll('/','-')}.pdf"`,'Cache-Control':'private, no-store'}});
}
