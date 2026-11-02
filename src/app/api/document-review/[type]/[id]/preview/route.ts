import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {NextResponse} from 'next/server';
import {getSessionProfile} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {documentVerification} from '@/lib/document-review';
import {buildBillingPrintHtml} from '@/lib/billing-print-template';
import {withBillingApproval,type BillingApproval} from '@/lib/billing-approval';
import {gymReportPdf} from '@/lib/gym-report-pdf';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{type:string;id:string}>}){
 const user=await getSessionProfile();
 if(!user||user.role!=='admin')return NextResponse.json({error:'Access denied'},{status:403});
 const {type,id}=await params;
 if(!['billing','gym'].includes(type)||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))return NextResponse.json({error:'Invalid document'},{status:400});
 try{
  const db=createAdminClient();
  const {data:doc,error}=await db.from(type==='billing'?'billing_preview_runs':'gym_monthly_approvals').select('*').eq('id',id).maybeSingle();
  if(error)throw error;
  if(!doc)return NextResponse.json({error:'Document not found'},{status:404});
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
  if(type==='gym'){
   const verifications=doc.approved_at?(doc.verifications||[]):await documentVerification(type,id);
   const pdf=await gymReportPdf({...doc,verifications});
   const name=(doc.kind==='committee'?'Sports-Committee-Report':'Monthly-Payment-List')+'-'+doc.month.slice(0,7)+'.pdf';
   return new NextResponse(new Uint8Array(pdf),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':'inline; filename="'+name+'"'}});
  }
  const approval=await db.from('billing_run_approvals').select('*').eq('run_id',id).maybeSingle();
  if(approval.error)throw approval.error;
  const snapshot=withBillingApproval(doc.snapshot,approval.data as BillingApproval|null);
  const verifications=snapshot.approval?(snapshot.approval.verifications||[]):await documentVerification(type,id);
  const logo='data:image/jpeg;base64,'+(await readFile(join(process.cwd(),'public/billing/logo.jpg'))).toString('base64');
  const html=buildBillingPrintHtml(snapshot,logo,verifications).replace('Test preview · No automatic printer submission',snapshot.approval?'Approved invoice pack · A4 print layout':'Review preview · A4 print layout · Pending final approval');
  return new NextResponse(html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
 }catch{
  return NextResponse.json({error:'Unable to load the print preview. Please retry.'},{status:503});
 }
}
