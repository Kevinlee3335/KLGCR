import {expect,it} from 'vitest';
import {billingMailSummary} from './billing-mail-summary';
import {configSchema,defaultBillingConfig,makeSnapshot} from './billing-preview';
import fixture from './billing-preview-fixture.json';
import {BILLING_APPROVER_ID} from './billing-approval';
const config=configSchema.parse({...defaultBillingConfig,...fixture});
const approval={run_id:'pack',approved_by_user:BILLING_APPROVER_ID,approved_by:'James',approved_at:'2026-11-02T01:00:00Z',signature:{strokes:[[[0.1,0.2] as [number,number],[0.8,0.7] as [number,number]]]}};
it.each(['rental','utility'] as const)('includes the complete %s pack in one detailed email',kind=>{
 const snapshot={...makeSnapshot(kind,kind==='rental'?'2026-11':'2026-10','2026-11-02',config,'Admin'),approval};
 const result=billingMailSummary(snapshot);
 expect(result.text).toContain('Dear Joey,');
 expect(result.subject).toContain(kind==='rental'?'Rental invoice pack - November 2026':'Utilities invoice pack - October 2026');
 expect(result.text).toContain(`Number of invoices / statements: ${snapshot.lines.length}`);
 for(const line of snapshot.lines){expect(result.text).toContain(line.name);expect(result.text).toContain(line.billNo);expect(result.text).toContain(line.description)}
 expect(result.text).toContain('GRAND TOTAL: RM '+snapshot.total.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}));
 expect(result.text).toContain('Approved on: 02/11/2026, 09:00:00 MYT');
 expect(result.text).not.toContain('Verified by:');
});
it('includes utility readings and adjustments without disclosing meter photos in the email body',()=>{
 const snapshot={...makeSnapshot('utility','2026-10','2026-11-02',config,'Admin'),approval};
 const line=snapshot.lines[0];line.subsidy=5;line.cap=100;line.rounding=-0.02;
 line.details![0].rate=0.447;line.details![0].role='deduct';line.details![0].previousDate='2026-09-01';line.details![0].currentDate='2026-10-01';line.details![0].photo='data:image/jpeg;base64,private';
 const {text}=billingMailSummary(snapshot);
 expect(text).toContain('RM 0.447');expect(text).toContain('(deduction)');expect(text).toContain('Reading dates: 2026-09-01 to 2026-10-01');
 expect(text).toContain('Company subsidy: RM 5.00');expect(text).toContain('Agreement cap: RM 100.00');expect(text).toContain('Rounding adjustment: RM -0.02');expect(text).not.toContain('data:image');
});
it('only names verifiers recorded in the approved snapshot and blocks unsigned summaries',()=>{
 const snapshot=makeSnapshot('rental','2026-11','2026-11-02',config,'Admin');
 expect(()=>billingMailSummary(snapshot)).toThrow('James approval');
 const verified={...snapshot,approval:{...approval,verifications:[{user_id:'fikri',name:'Fikri',verified_at:'2026-11-01T01:00:00Z',signature:approval.signature},{user_id:'kevin',name:'Kevin',verified_at:'2026-11-01T02:00:00Z',signature:approval.signature}]}};
 expect(billingMailSummary(verified).text).toContain('Verified by: Fikri / Kevin');
});
