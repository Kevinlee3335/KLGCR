import {NextResponse} from 'next/server';
import {retryQueuedBillingMail} from '@/lib/billing-mail';
import {billingPreviewEnabled} from '@/lib/billing-preview';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=180;

export async function GET(request:Request) {
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`){
  return NextResponse.json({error:'Unauthorized'},{status:401});
 }
 if(!billingPreviewEnabled())return NextResponse.json({skipped:true});
 try {
  return NextResponse.json(await retryQueuedBillingMail());
 } catch {
  console.error('Billing mail retry worker could not read the queue');
  return NextResponse.json({error:'Unable to retry approved billing emails'},{status:503});
 }
}
