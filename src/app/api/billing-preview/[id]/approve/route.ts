import {dispatchBillingMail} from "@/lib/billing-mail";
import {NextRequest,NextResponse} from 'next/server';
import {getSessionProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {billingPreviewEnabled} from '@/lib/billing-preview';
import {BILLING_APPROVER_ID} from '@/lib/billing-approval';
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const profile=await getSessionProfile();
 if(!billingPreviewEnabled()||!profile||profile.role!=='admin'||profile.id!==BILLING_APPROVER_ID)return NextResponse.json({error:'Only James can approve billing invoices.'},{status:403});
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Invalid origin'},{status:403});
 const {id}=await params;if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))return NextResponse.json({error:'Invalid invoice pack'},{status:400});
 try{
  const db=await createClient();const {data,error}=await db.rpc('approve_billing_run',{billing_run_id:id});
  if(error)return NextResponse.json({error:error.message.includes('signature')?'Save your E-signature above before approving.':'Unable to approve. Reload and review the saved invoice pack.'},{status:409});
  const mail=await dispatchBillingMail(id).catch(()=>({status:"pending",error:"Approval saved. Email delivery needs checking."}));
  return NextResponse.json({approval:data,mail},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Unable to approve. Please reload to check the current status.'},{status:503});}
}
