import {NextRequest, NextResponse} from 'next/server';
import {PDFDocument, rgb} from 'pdf-lib';
import QRCode from 'qrcode';
import {getSessionProfile} from '@/lib/auth';
import {gmailGateway} from '@/lib/billing-mail';
import {complaintReceivedEmail, jobCompletedEmail, tenantNotAvailableEmail, COMMON_EMAIL_FOOTER} from '@/lib/email';
import {financialPdf, type OfficialReceipt} from '@/lib/official-receipt';
import {purchaseOrderPdf} from '@/lib/purchase-orders/pdf';
import type {PurchaseOrder} from '@/lib/purchase-orders/schema';
import {buildBillingPrintHtml} from '@/lib/billing-print-template';
import type {BillingSnapshot} from '@/lib/billing-preview';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const TO = 'klgcr.kevin@gmail.com';
const FROM = 'klgcr.noreply@gmail.com';
const cases = [
  ['complaint', 'Maintenance request received', 'Text'],
  ['unavailable', 'Maintenance visit: tenant unavailable', 'Text'],
  ['completed', 'Maintenance request completed', 'Text'],
  ['gym-registration', 'Gym registration approved', 'Sample Receipt PDF + sample QR'],
  ['gym-future', 'Gym future registration approved', 'Sample Receipt PDF + sample QR'],
  ['gym-renewal', 'Gym renewal approved', 'Sample Receipt PDF + sample QR'],
  ['gym-reminder', 'Gym renewal reminder', 'HTML + text'],
  ['gym-cancellation', 'Gym cancellation approved', 'HTML + text'],
  ['rental-receipt', 'Rental official receipt', 'Sample Receipt PDF'],
  ['utility-receipt', 'Utilities official receipt', 'Sample Receipt PDF'],
  ['rental-statement', 'Rental statement of account', 'Sample Statement PDF'],
  ['utility-statement', 'Utilities statement of account', 'Sample Statement PDF'],
  ['building-po', 'Building Material approved PO', 'Sample PO PDF'],
  ['office-po', 'Office Supplies approved PO', 'Sample PO PDF'],
  ['rental-invoice', 'James-approved Rental invoice pack', 'Sample PDF + invoice HTML in body'],
  ['utility-invoice', 'James-approved Utilities invoice pack', 'Sample PDF + invoice HTML in body'],
] as const;
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const day = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

async function watermark(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  for (const page of pdf.getPages()) {
    page.drawText('SAMPLE / TEST ONLY - NOT A VALID FINANCIAL DOCUMENT', {x:22,y:page.getHeight()-18,size:9,color:rgb(.75,0,0)});
  }
  return Buffer.from(await pdf.save());
}
function sampleReceipt(kind: string): OfficialReceipt {
  return {id:'00000000-0000-4000-8000-000000000001',receipt_no:'SAMPLE-NO-RUNNING-NUMBER',kind,paid_on:day(),payer:'SAMPLE TENANT / MEMBER',email:TO,amount:kind==='gym'?40:kind==='rental'?800:128.50,description:`SAMPLE ${kind} payment - testing only; no payment was recorded`,bank_reference:'SAMPLE-TRANSFER',proof_path:null,emailed_at:null,email_error:null};
}
async function messageFor(id: string) {
  const now = new Date().toISOString(), date = day(), period = date.slice(0,7);
  const complaint = {reporterName:'Sample Resident',complaintNo:'SAMPLE-CMP-0001',roomNo:'SAMPLE ROOM',description:'Sample leaking tap - testing only'};
  if (id==='complaint') return {...complaintReceivedEmail({...complaint,submittedAt:now}),pdf:null};
  if (id==='unavailable') return {...tenantNotAvailableEmail({...complaint,appointmentDate:date,appointmentTime:'10:00',attendedAt:now}),pdf:null};
  if (id==='completed') return {...jobCompletedEmail({...complaint,completedAt:now}),pdf:null};
  if (id.startsWith('gym-')) {
    const approved = ['gym-registration','gym-future','gym-renewal'].includes(id);
    const cancelled = id==='gym-cancellation', renewal = id==='gym-renewal';
    const future = new Date(date+'T12:00:00Z'); future.setUTCMonth(future.getUTCMonth()+1,1);
    const start = id==='gym-future'?future.toISOString().slice(0,10):period+'-01';
    const last = new Date(start+'T12:00:00Z'); last.setUTCMonth(last.getUTCMonth()+1,0);
    const expires = last.toISOString().slice(0,10);
    const subject = cancelled?'Membership cancellation approved – KLG Campus Residence':approved?renewal?'Membership renewal approved – KLG Campus Residence':'Membership registration approved – KLG Campus Residence':'Membership renewal reminder – KLG Campus Residence';
    const body = cancelled?'Your membership cancellation request has been approved. Your membership has been cancelled.':approved?renewal?`Your membership renewal has been approved. Membership is valid until ${expires}.`:`Your membership application has been approved. Membership is valid from ${start} until ${expires}.`+(id==='gym-future'?` Your membership starts on ${start}; access is not valid before that date.`:' Your access card will be activated within 48 hours after your membership application is approved.'):`Please renew your membership for ${period}. If you do not renew, your access card will be listed for blocking on ${start}. If you have submitted a receipt, it may still be pending Admin verification.`;
    const linkNote = cancelled?'':'SAMPLE renewal / membership links are intentionally inactive. No real member token is included.';
    const qr = approved?await QRCode.toDataURL('KLGCR SAMPLE TEST QR - NO MEMBERSHIP ACCESS'):'';
    return {subject,text:`Dear Sample Member,\n\n${body}\n\n${linkNote}\n\n${COMMON_EMAIL_FOOTER}`,html:`<p>Dear Sample Member,</p><p>${esc(body)}</p><p>${esc(linkNote)}</p>${qr?`<p>Sample QR (no access):</p><img width="200" height="200" src="${qr}" alt="Sample membership QR">`:''}<p>${esc(COMMON_EMAIL_FOOTER).replace(/\n/g,'<br>')}</p>`,pdf:approved?await watermark(await financialPdf({receipt:sampleReceipt('gym')})):null};
  }
  const kind = id.startsWith('utility-')?'utility':'rental';
  if (id.endsWith('-receipt')) {
    const r = sampleReceipt(kind);
    return {subject:'Official Receipt '+r.receipt_no,text:`Dear ${r.payer},\n\nPlease find your official receipt attached.\n${r.description}\nAmount received: RM ${r.amount.toFixed(2)}\n\nKLG Campus Residence Management`,pdf:await watermark(await financialPdf({receipt:r}))};
  }
  if (id.endsWith('-statement')) {
    return {subject:'Statement of Account - SAMPLE TENANT',text:'Dear SAMPLE TENANT,\n\nPlease find your statement of account attached.\n\nKLG Campus Residence Management',pdf:await watermark(await financialPdf({title:'STATEMENT OF ACCOUNT',lines:['SAMPLE / TEST ONLY','Company: SAMPLE TENANT',`Statement as at: ${date} | ${kind}`,`${period} | SAMPLE-INVOICE-001 | Billed RM 800.00 | Paid RM 400.00 | Balance RM 400.00`,'Payments received:',`${date} | SAMPLE-RECEIPT | RM 400.00`,'TOTAL OUTSTANDING: RM 400.00']}))};
  }
  if (id.endsWith('-po')) {
    const office = id==='office-po';
    const order: PurchaseOrder = {id:'00000000-0000-4000-8000-000000000002',po_no:'SAMPLE-PO-ONLY',order_date:date,requested_by:'Sample Requester',approved_by:'SAMPLE APPROVER',requested_date:date,approved_date:date,created_at:now,approved_at:now,items:[{itemId:'00000000-0000-4000-8000-000000000003',code:office?'SAMPLE-OFF':'SAMPLE-PG',description:office?'SAMPLE A4 PAPER':'SAMPLE WINDOW HANDLE',unit:'UNITS',specification:'SAMPLE - DO NOT ORDER',quantity:2,balanceQty:3,location:'SAMPLE LOCATION'}]};
    return {subject:office?'Purchase Order SAMPLE-PO-ONLY – Office Supplies | K HOTEL SDN BHD':'Approved Purchase Order SAMPLE-PO-ONLY — KLGCR',text:office?'Dear Supplier,\n\nPlease find attached our approved Purchase Order SAMPLE-PO-ONLY for office supplies for K HOTEL SDN BHD (KLG Campus Residence).\n\nKindly confirm receipt of this order and advise on item availability and the expected delivery date. If any items are unavailable, please inform us before making any substitutions.\n\nDelivery location: KLG Campus Residence.\n\nThank you.\n\nBest regards,\nManagement Office\nK HOTEL SDN BHD\nKLG Campus Residence':'Building Material Purchase Order: SAMPLE-PO-ONLY\nApproved by: SAMPLE APPROVER\n\nSample PDF only. No actual approval or signature.\n\nKLG Campus Residence Management',pdf:await watermark(await purchaseOrderPdf(order))};
  }
  const line = {accountId:kind==='utility'?'laundrette':'sample',name:'SAMPLE TENANT - TEST ONLY',billNo:'SAMPLE-INVOICE-001',amount:kind==='utility'?128.50:800,description:`SAMPLE ${kind} for ${period} - NOT PAYABLE`,addr:['SAMPLE ADDRESS'],details:kind==='utility'?[{label:'ELECTRICITY (kWh)',prev:1000,curr:1200,usage:200,rate:.6,amount:120,unit:'kWh',serial:'SAMPLE-METER'}]:undefined};
  const snapshot: BillingSnapshot = {kind,period,issueDate:date,total:line.amount,lines:[line],testMode:true,createdBy:'Sample administrator'};
  const logo = await readFile(join(process.cwd(),'public/billing/logo.jpg'));
  return {subject:`James-approved ${kind==='rental'?'Rental':'Utilities'} invoices - ${period}`,text:`SAMPLE approved invoice pack\n${line.billNo} | ${line.name} | RM ${line.amount.toFixed(2)}\n\nTest only. No approval or actual invoice was created.\nThe production invoice email uses an HTML attachment to Accounting; this test uses the shared PDF transport to Kevin only.`,html:buildBillingPrintHtml(snapshot,'data:image/jpeg;base64,'+logo.toString('base64')),pdf:await watermark(await financialPdf({title:'SAMPLE '+kind.toUpperCase()+' INVOICE',lines:['SAMPLE / TEST ONLY - NOT PAYABLE',line.name,line.billNo,line.description,`AMOUNT RM ${line.amount.toFixed(2)}`,'The original invoice HTML preview is included in the email body.','This sample PDF is a mail attachment test, not the production invoice layout.']}))};
}

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile || profile.role!=='admin') return new NextResponse('Admin permission required',{status:403});
  const run = crypto.randomUUID();
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KLGCR email samples</title><style>body{background:#101318;color:#ede8dd;font:16px system-ui;margin:0;padding:32px}main{max-width:1000px;margin:auto}h1{color:#d7b66b}p{line-height:1.6}button{background:#d7b66b;color:#101318;border:0;border-radius:8px;padding:14px 24px;font-weight:700;cursor:pointer}button:disabled{opacity:.5}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{text-align:left;padding:12px;border-bottom:1px solid #35383e}small{color:#c0bbb1}.status{color:#e5c77f}</style><main><h1>Noreply email sample test</h1><p>From: <b>${FROM}</b><br>All tests go only to: <b>${TO}</b></p><p>Sample data only. No real payment, approval, membership, PO or running number is created. No tenant or supplier receives these messages. PDF samples are marked TEST. Production PO / invoice destination rules stay in place; these samples use the shared PDF gateway to the fixed test inbox.</p><p>Invoice samples include HTML in the email body and a sample PDF. The production Accounting invoice email still uses an HTML attachment.</p><button id="send">Send all ${cases.length} sample emails</button> <span id="summary" role="status">Ready</span><table><thead><tr><th>Email type</th><th>Attachment</th><th>Status</th></tr></thead><tbody>${cases.map(([id,label,attachment])=>`<tr><td>${esc(label)}</td><td>${esc(attachment)}</td><td id="s-${id}" class="status">Not sent</td></tr>`).join('')}</tbody></table><p><small>Bell / push notifications, Daily Task and Meeting reminders, Cleaner Supplies approvals and daily reports have no noreply email sender in current website code. No email is created for those here.</small></p></main><script>
const cases=${JSON.stringify(cases)},run=${JSON.stringify(run)};
document.getElementById('send').onclick=async function(){this.disabled=true;let sent=0,failed=0;for(const [id] of cases){const cell=document.getElementById('s-'+id);cell.textContent='Sending…';try{const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,run})});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'Unconfirmed delivery');cell.textContent='Sent from '+j.sender+' to '+j.to;sent++}catch(e){cell.textContent='Needs review: '+e.message;failed++}document.getElementById('summary').textContent=sent+' sent · '+failed+' need review · '+(cases.length-sent-failed)+' remaining'}document.getElementById('summary').textContent='Complete: '+sent+' sent · '+failed+' need review. No automatic resend.'};</script></html>`;
  return new NextResponse(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
export async function POST(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile || profile.role!=='admin') return NextResponse.json({error:'Admin permission required'},{status:403});
  if(req.headers.get('origin')!==req.nextUrl.origin) return NextResponse.json({error:'Invalid origin'},{status:403});
  try {
    const {id,run} = z.object({id:z.string(),run:z.string().uuid()}).parse(await req.json());
    const index = cases.findIndex(c=>c[0]===id);
    if(index<0) return NextResponse.json({error:'Unknown test case'},{status:400});
    const sample = await messageFor(id);
    const subject = `[TEST ${String(index+1).padStart(2,'0')}/${cases.length}] ${sample.subject}`;
    const notice = 'TEST / SAMPLE ONLY. Sent only to Kevin for review. No action or payment is required.\n\n';
    const html = 'html' in sample ? `<p style="color:#a00;font-weight:bold">TEST / SAMPLE ONLY - NOT A REAL REQUEST</p>${sample.html}` : undefined;
    // Separate deterministic key for every test case. Never touches production queues or counters.
    const key = 'statement_'+run.slice(0,-2)+(index+1).toString(16).padStart(2,'0');
    const result = sample.pdf ? await gmailGateway({action:'finance-send',from:FROM,to:TO,key,subject,text:notice+sample.text,html,pdfBase64:sample.pdf.toString('base64'),fileName:`SAMPLE-${id}.pdf`},25000) : await gmailGateway({to:TO,subject,text:notice+sample.text,html},25000);
    if(result.ok!==true||result.sender!==FROM||(sample.pdf&&(result.status!=='sent'||result.to!==TO||result.key!==key))) throw Error('Gateway did not confirm the expected sender / recipient. Check Sent mail before retrying.');
    return NextResponse.json({ok:true,id,sender:FROM,to:TO,attachment:sample.pdf?`SAMPLE-${id}.pdf`:null},{headers:{'Cache-Control':'no-store'}});
  } catch(e) {
    return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Sample delivery not confirmed'},{status:502,headers:{'Cache-Control':'no-store'}});
  }
}
