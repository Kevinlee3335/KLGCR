// @vitest-environment node
import {it,expect} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {writeFileSync} from 'node:fs';
import {amountWords,financialPdf} from './official-receipt';
it('renders receipt and long multi-page statements as valid PDFs',async()=>{
 expect(amountWords(1200)).toBe('One Thousand Two Hundred Ringgit Only');expect(amountWords(40.05)).toBe('Forty Ringgit and Five Sen Only');
 const pdf=await financialPdf({receipt:{id:'test',receipt_no:'KLGCR/260001',kind:'rental',paid_on:'2026-10-29',payer:'SAMPLE COMPANY SDN. BHD.',email:'test@example.com',amount:1200,description:'2026-08 - INV 2608/C/001 RM 600.00; 2026-09 - INV 2609/C/001 RM 600.00',proof_path:null,bank_reference:'SAMPLE123456',emailed_at:null,email_error:null}});expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);writeFileSync('/tmp/klg-receipt-qa.pdf',pdf);
 const statement=await financialPdf({title:'STATEMENT OF ACCOUNT',lines:Array.from({length:100},(_,i)=>`2026-${i} | INV 2610/C/001 | Billed RM 600.00 | Paid RM 200.00 | Balance RM 400.00`)});expect((await PDFDocument.load(statement)).getPageCount()).toBeGreaterThan(1);
});
