import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {NextRequest,NextResponse} from 'next/server';
import {getSessionProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {buildBillingPrintHtml} from '@/lib/billing-print-template';
import {withBillingApproval,type BillingApproval} from '@/lib/billing-approval';
import {isBillingDocumentKind,billingKindTitle} from '@/lib/billing-documents';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string;line:string}>}){
 const p=await getSessionProfile();if(!p||!['admin','management_viewer'].includes(p.role))return NextResponse.json({error:'Access denied'},{status:403});
 const {id,line}=await params;if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)||!/^(0|[1-9]\d{0,3})$/.test(line))return NextResponse.json({error:'Invalid billing document'},{status:400});
 try{
  const db=await createClient();const [pack,approval]=await Promise.all([db.from('billing_preview_runs').select('id,kind,period,snapshot').eq('id',id).maybeSingle(),db.from('billing_run_approvals').select('*').eq('run_id',id).maybeSingle()]);
  if(pack.error||approval.error)throw Error();if(!pack.data||!isBillingDocumentKind(pack.data.kind)||!Array.isArray(pack.data.snapshot?.lines)||!pack.data.snapshot.lines[Number(line)])return NextResponse.json({error:'Billing document not found'},{status:404});
  const snapshot=withBillingApproval(pack.data.snapshot,approval.data as BillingApproval|null),selected=snapshot.lines[Number(line)];
  const logoUrl=pack.data.kind==='rental'?'data:image/jpeg;base64,'+(await readFile(join(process.cwd(),'public/billing/logo.jpg'))).toString('base64'):new URL('/billing/logo.jpg',req.url).href;
  const html=buildBillingPrintHtml({...snapshot,lines:[selected],total:selected.amount},logoUrl).replace('Test preview · No automatic printer submission',snapshot.approval?'Approved invoice · James E-signature':'Pending James approval');
  const fileName=`${billingKindTitle(pack.data.kind)}-${pack.data.period}-${selected.billNo}`.replace(/[^A-Za-z0-9._-]/g,'_')+'.html';
  return new NextResponse(html,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Disposition':`${req.nextUrl.searchParams.get('download')==='1'?'attachment':'inline'}; filename="${fileName}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return NextResponse.json({error:'Unable to open the saved billing document. Please retry.'},{status:503});}
}
