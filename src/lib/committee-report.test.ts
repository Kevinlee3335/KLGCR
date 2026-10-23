import {expect,it} from "vitest";
import {committeePayable,renderCommitteeReport,type CommitteeReport} from "./committee-report";
it('applies the exact contract thresholds and cap',()=>{
 for(const [total,payout] of [[0,500],[999.99,500],[1000,400],[2400,960],[7500,3000],[9000,3000]]) expect(committeePayable(total)).toBe(payout);
});
it('preserves template text and totals, escapes names, and paginates without losing rows',()=>{
 for(const n of [0,1,24,36,37,60,100]){
 const report:CommitteeReport={month:'2026-09-01',generated_at:'2026-10-07',template_version:1,entries:Array.from({length:n},(_,i)=>({member_id:String(i),full_name:`Name ${i} <script>`,amount:40,payments:[]})),payment_count:n,member_count:n,total_amount:n*40,remuneration:committeePayable(n*40),calculation_rule:''};
 const html=renderCommitteeReport(report);
 expect(html).toContain('SEPTEMBER 2026');
 expect(html.match(/LESS THAN RM 1000.00/g)||[]).toHaveLength(1);
 const pages=html.split('<section class="sheet">').slice(1);
 for(const page of pages.slice(1)){expect(page).not.toContain('AMOUNT PAYABLE');expect(page).not.toContain('TERMS &amp; CONDITIONS');expect(page).not.toMatch(/>A\)<|>B\)</);expect(page).toContain('NAME');}
 expect(html).toContain('TOTAL MEMBERSHIP RECEIVED (RM)');
 expect(html).toContain('Print / Save PDF');
 expect(html).not.toContain('<script>');
 expect(html.match(/Name \d+ &lt;script&gt;/g)||[]).toHaveLength(n);
 expect(html).toContain(report.total_amount.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}));
 }
});
