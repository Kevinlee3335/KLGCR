import { describe,it,expect } from "vitest";
import { buildBillingPrintHtml } from './billing-print-template';
import { configSchema,defaultBillingConfig,makeSnapshot } from './billing-preview';
import fixture from './billing-preview-fixture.json';
const keys=['bungalow-l3','umart','laundrette','mmf-cafe','bungalow-l2','norhenany','emma-omar','utm','flextronics','medicassemblage'];
const config=configSchema.parse({...defaultBillingConfig,...fixture,utilityAccounts:fixture.utilityAccounts.map((a,i)=>({...a,id:keys[i]}))});
describe('original invoice formats',()=>{
 it('uses original Excel vector pages for all ten documents, with dynamic invoice fields and amount words',()=>{const s=makeSnapshot('utility','2026-10','2026-10-13',config,'Sample administrator');const html=buildBillingPrintHtml(s,'/billing/logo.jpg');expect((html.match(/class="excel-sheet"/g)||[])).toHaveLength(10);expect((html.match(/<svg/g)||[])).toHaveLength(10);expect(html).toContain('KLG/U/2610-01');expect(html).toContain('RINGGIT MALAYSIA ONE HUNDRED SEVEN AND CENTS SEVENTY ONLY');expect(html).not.toContain('UTILITIES STATEMENT / INVOICE');expect(html).not.toContain('FAIZ EKHWAN');expect(html).not.toContain('NOURIL AUMIL')});
 it('keeps the original rental HTML columns, bank block and signature, escaping tenant text',()=>{const s=makeSnapshot('rental','2026-11','2026-11-03',config,'Sample');s.lines[0].name='<script>alert(1)</script>';const html=buildBillingPrintHtml(s,'/billing/logo.jpg');expect(html).toContain('NET AMOUNT PAID (RM)');expect(html).toContain('BUSINESS TYPE');expect(html).toContain('(Authorised Signature)');expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');expect(html).not.toContain('<script>alert(1)</script>')});
});
