import {dispatchApprovedPurchase} from '@/lib/purchase-orders/dispatch';
import { dispatchPoNotifications } from '@/lib/purchase-orders/notifications';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { archivedPurchaseOrderPdf } from '@/lib/purchase-orders/archive';
export const runtime='nodejs';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const profile=await getSessionProfile();
 if(!profile||profile.role!=='admin')return NextResponse.json({error:'Administrator approval required.'},{status:403});
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Invalid origin'},{status:403});
 try{
  const {id}=await params;const {expectedRevision}=await req.json();
  if(!/^[0-9a-f-]{36}$/i.test(id)||!Number.isInteger(expectedRevision)||expectedRevision<1)return NextResponse.json({error:'Invalid PO revision'},{status:400});
  const db=await createClient();const {data,error}=await db.rpc('approve_inventory_purchase_order',{order_id:id,expected_revision:expectedRevision});
  if(error)return NextResponse.json({error:'Unable to approve. Refresh and review the latest PO before trying again.'},{status:409});
  await dispatchPoNotifications(data.id).catch(error=>console.error('PO notifications deferred',error));
    await archivedPurchaseOrderPdf(data);
  await dispatchApprovedPurchase(data.id,data.revision,req.nextUrl.origin);
  return NextResponse.json({order:data});
 }catch{return NextResponse.json({error:'Unable to complete approval. Refresh to check the current status.'},{status:503});}
}
