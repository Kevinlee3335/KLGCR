import {NextRequest,NextResponse} from 'next/server';
import {getSessionProfile} from '@/lib/auth';
import {billingPreviewEnabled} from '@/lib/billing-preview';
import {dispatchBillingMail} from '@/lib/billing-mail';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const p=await getSessionProfile();if(!billingPreviewEnabled()||p?.role!=='admin')return NextResponse.json({error:'Administrator access required'},{status:403});
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Invalid origin'},{status:403});
 const {id}=await params;if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))return NextResponse.json({error:'Invalid invoice pack'},{status:400});
 try{return NextResponse.json(await dispatchBillingMail(id));}catch{return NextResponse.json({error:'Unable to check delivery. Refresh the email status before retrying.'},{status:503});}
}
