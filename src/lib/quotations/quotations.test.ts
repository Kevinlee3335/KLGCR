import {describe,it,expect} from 'vitest';
import {appendQuotation,blankQuotation,customerDirectory,customerInput,saveCustomer,initialRegistry,totalAmount,quotationInput} from './model';
import {quotationPrintHtml} from './print';
describe('quotation register',()=>{
 it('automatically saves customers without consuming quotation numbers and keeps old quotes unchanged',()=>{
  const initial=initialRegistry(),data=customerInput.parse(initial.quotes[0]);
  expect(customerDirectory(initial)[0].customer).toBe('UTMSPACE');
  let r=saveCustomer(initial,{...data,customer:'New Company',phone:'0123456789'},'new-customer');
  r=saveCustomer(r,{...data,customer:'New Company',phone:'0199999999'},'new-customer');
  expect(customerDirectory(r)).toHaveLength(2);expect(customerDirectory(r).find(c=>c.customer==='New Company')?.phone).toBe('0199999999');
  expect(r.counters).toEqual(initial.counters);expect(r.quotes).toEqual(initial.quotes);
  r=saveCustomer(r,{...data,customer:'Renamed Company'},'new-customer');expect(customerDirectory(r)).toHaveLength(2);expect(customerDirectory(r).some(c=>c.customer==='New Company')).toBe(false);
 });
 it('retains the original and starts the next October quotation at 0002',()=>{
  const initial=initialRegistry();expect(initial.quotes[0].number).toBe('2610-0001');expect(totalAmount(initial.quotes[0])).toBe(1000);
  const next=appendQuotation(initial,{...initial.quotes[0],date:'2026-10-23'},'next','Kevin');expect(next.quotes[0].number).toBe('2610-0002');expect(next.quotes[1]).toEqual(initial.quotes[0]);
  expect(appendQuotation(next,next.quotes[0],'next','Kevin')).toBe(next);
 });
 it('resets for November and January, and retains the old month counter',()=>{
  let r=initialRegistry();for(const [date,id,number] of [['2026-11-01','nov','2611-0001'],['2027-01-01','jan','2701-0001'],['2026-10-31','oct','2610-0002']]){r=appendQuotation(r,{...r.quotes[0],date},id,'Kevin');expect(r.quotes[0].number).toBe(number)}
 });
 it('rejects impossible dates and calculates amounts to cents',()=>{expect(quotationInput.safeParse({...initialRegistry().quotes[0],date:'2026-02-30'}).success).toBe(false);expect(totalAmount({...blankQuotation(),items:[{description:'A',quantity:3,price:0.1,unit:''},{description:'B',quantity:1,price:12.345,unit:''}]})).toBe(12.65)});
 it('prints escaped customer data on the original Excel grid without a letterhead',()=>{const q=initialRegistry().quotes[0],html=quotationPrintHtml({...q,customer:'<script>alert(1)</script>'});expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).toContain('QT 2610-0001');expect(html).toContain('RINGGIT MALAYSIA ONE THOUSAND ONLY');expect(html).toContain('viewBox=');expect(html).not.toContain('Tel: +6012');expect(html).toContain('Prepared By');expect(html).toContain('Approved By')});
});

it('prints both signed roles on the final page and escapes names',async()=>{
 const {writeFileSync}=await import('node:fs');
 const q={...initialRegistry().quotes[0],createdBy:'Kevin <script>alert(1)</script>',preparedSignature:{strokes:[[[0.1,0.7],[0.3,0.2],[0.7,0.6]]] as [number,number][][]},approvedBy:'James',approvedAt:'2026-10-27T04:00:00Z',approvedSignature:{strokes:[[[0.1,0.7],[0.4,0.2],[0.8,0.6]]] as [number,number][][]}};
 const html=quotationPrintHtml(q);
 expect(html).toContain('Prepared By');expect(html).toContain('Approved By');expect(html).not.toContain('<script>alert(1)</script>');expect(html.match(/<polyline /g)).toHaveLength(2);
 writeFileSync('/tmp/klgcr-quotation-signed.html',html);
});
