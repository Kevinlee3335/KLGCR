import { NextRequest,NextResponse } from 'next/server';
import {dispatchPoNotifications} from '@/lib/purchase-orders/notifications';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||req.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});
 try{await dispatchPoNotifications();return NextResponse.json({ok:true});}catch{return NextResponse.json({error:'Unable to dispatch PO notifications'},{status:503});}
}
