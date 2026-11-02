import type {BillingSnapshot} from './billing-preview';

const money=(amount:number)=>'RM '+amount.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});

/** One complete monthly pack produces one email, with every account in its body. */
export function billingMailSummary(snapshot:BillingSnapshot){
 const label=snapshot.kind==='rental'?'Rental':'Utilities';
 const month=new Date(snapshot.period+'-01T00:00:00Z').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'Asia/Kuala_Lumpur'});
 const subject=`${label} invoice pack - ${month} | K HOTEL SDN BHD`;
 const approval=snapshot.approval;
 if(!approval)throw Error('James approval is required before preparing the invoice email.');
 const verified=approval.verifications?.map(v=>v.name).join(' / ');
 const details=snapshot.lines.map((line,index)=>{
  const rows=[`${index+1}. ${line.name}`,`   Invoice / reference: ${line.billNo}`,`   Description: ${line.description}`];
  if(snapshot.kind==='utility'){
   for(const meter of line.details||[]){
    rows.push(`   ${meter.label}${meter.serial?' ('+meter.serial+')':''}: ${meter.prev} → ${meter.curr} ${meter.unit}; usage ${meter.usage} ${meter.unit} × RM ${meter.rate.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:20})} = ${money(meter.amount)}${meter.role==='deduct'?' (deduction)':meter.role==='capped'?' (subject to agreement cap)':''}`);
    if(meter.previousDate||meter.currentDate)rows.push(`   Reading dates: ${meter.previousDate||'Not recorded'} to ${meter.currentDate||'Not recorded'}`);
   }
   if(line.cap!=null)rows.push(`   Agreement cap: ${money(line.cap)}`);
   if(line.subsidy)rows.push(`   Company subsidy: ${money(line.subsidy)}`);
   if(line.rounding)rows.push(`   Rounding adjustment: ${money(line.rounding)}`);
  }
  rows.push(`   Amount payable: ${money(line.amount)}`);
  return rows.join('\n');
 }).join('\n\n');
 const approvedAt=new Date(approval.approved_at).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur'});
 const text=[
  'Dear Joey,',
  `Please find attached the complete approved ${label.toLowerCase()} invoice pack for ${month}. All ${snapshot.lines.length} invoices / statements are included together in this email.`,
  `Billing month: ${month}\nInvoice date: ${snapshot.issueDate}\nNumber of invoices / statements: ${snapshot.lines.length}`,
  'BILLING DETAILS\n\n'+details,
  `GRAND TOTAL: ${money(snapshot.total)}`,
  `${verified?'Verified by: '+verified+'\n':''}Approved by: ${approval.approved_by}\nApproved on: ${approvedAt} MYT`,
  'Please process the attached approved billing documents. The single attachment contains the complete set with the approval signatures. Open the HTML attachment in a browser to view or Print / Save as PDF.',
  'Thank you.\n\nKLG Campus Residence Management\nK HOTEL SDN BHD'
 ].join('\n\n');
 return {subject,text};
}
