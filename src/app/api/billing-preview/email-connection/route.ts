import {NextResponse} from 'next/server';
import {getSessionProfile} from '@/lib/auth';
import {billingPreviewEnabled} from '@/lib/billing-preview';
import {billingMailConnection} from '@/lib/billing-mail';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=30;
export async function GET(){
 try{const p=await getSessionProfile();if(!billingPreviewEnabled()||p?.role!=='admin')return NextResponse.json({error:'Administrator access required'},{status:403});return NextResponse.json(await billingMailConnection(),{headers:{'Cache-Control':'no-store'}});}
 catch{return NextResponse.json({error:'Unable to verify your session or Gmail connection. Refresh and try again.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
