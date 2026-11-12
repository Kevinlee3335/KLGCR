import {NextResponse} from 'next/server';
import {retryQueuedBillingMail} from '@/lib/billing-mail';
import {billingPreviewEnabled} from '@/lib/billing-preview';
import {retryQueuedComplianceMail} from '@/lib/compliance-approval-delivery';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=180;

export async function GET(request:Request) {
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`){
  return NextResponse.json({error:'Unauthorized'},{status:401});
 }
 const [billing, compliance] = await Promise.allSettled([
  billingPreviewEnabled() ? retryQueuedBillingMail() : {skipped:true},
  retryQueuedComplianceMail(),
 ]);
 if(compliance.status==='rejected')console.error('Compliance mail retry worker could not read the queue');
 if(billing.status==='fulfilled')return NextResponse.json(billing.value);
 console.error('Billing mail retry worker could not read the queue');
 return NextResponse.json({error:'Unable to retry approved billing emails'},{status:503});
}
