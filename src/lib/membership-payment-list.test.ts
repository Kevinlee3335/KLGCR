import {expect,it} from 'vitest';
import {paymentListRange,renderPaymentList} from './membership-payment-list';
it('keeps month boundaries separate including year end',()=>{
 expect(paymentListRange('2026-08')).toEqual({start:'2026-08-01',end:'2026-09-01'});
 expect(paymentListRange('2026-12')).toEqual({start:'2026-12-01',end:'2027-01-01'});
});
it('prints the supplied five columns with editable receipt values and escaped names',()=>{
 const html=renderPaymentList('2026-08',[{id:'1',collected_on:'2026-08-03',full_name:'Name <script>',member_reference:'GYM26-01',member_type:'outsider',source:'system',approved_at:null,amount:40,receipt_no:'KLGCR / 17801'}]);
 expect(html).toContain('<th>NO</th><th>DATE</th><th>RECEIPT NO</th><th>NAME</th><th>ROOM NO</th>');
 expect(html).toContain('03/08/2026</td><td>KLGCR / 17801</td>');expect(html).toContain('GYM26-01');expect(html).toContain('Name &lt;script&gt;');
});
it('prints the separate deposit amount and receipt without adding a membership fee',()=>{
 const html=renderPaymentList('2026-10',[{id:'deposit',collected_on:'2026-10-23',full_name:'Deposit Member',member_reference:'A421',member_type:'resident',source:'manual',approved_at:null,amount:10,kind:'access_card_deposit',receipt_no:'D100'}]);
 expect(html).toContain('Access Card Deposit');expect(html).toContain('10.00</td>');expect(html).toContain('D100');expect(html).not.toContain('40.00');
});
