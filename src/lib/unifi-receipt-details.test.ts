// @vitest-environment node
import { expect, it } from 'vitest';
import { isUnifiReceiptSubject, matchUnifiReceipt, unifiEmailText, unifiPaymentFollowups, unifiReceiptDetails } from './unifi-receipt-details';
const invoices = [
  {id:'oct',period:'2026-10',account_number:'1043057882',invoice_number:'INV20261022111',received_at:'2026-10-22T08:00:00Z',due_date:'2026-11-12'},
  {id:'nov',period:'2026-11',account_number:'1043057882',invoice_number:'INV20261122222',received_at:'2026-11-22T08:00:00Z',due_date:'2026-12-13'},
];
it('reads explicit account, receipt reference, amount and payment date',()=>{
  const receipt=unifiReceiptDetails('Payment Receipt\nAccount No.: 1043057882\nPayment Date: 23 Nov 2026\nAmount Paid: RM 369.95\nReceipt No: RCP-1234');
  expect(receipt).toMatchObject({account_number:'1043057882',payment_date:'2026-11-23',amount:369.95,receipt_number:'RCP-1234',confirmed:true});
  expect(matchUnifiReceipt(receipt,invoices)).toBe('nov');
});
it('does not use an old receipt, ambiguous dates, multiple accounts or a pending payment as current payment evidence',()=>{
  const old=unifiReceiptDetails('Account No: 1043057882\nPayment Date: 23 Oct 2026');
  expect(matchUnifiReceipt(old,invoices)).toBe('oct');
  const ambiguous=unifiReceiptDetails('Account No: 1043057882\nPayment Date: 03/11/2026');
  expect(ambiguous.payment_date).toBeNull();expect(matchUnifiReceipt(ambiguous,invoices)).toBeNull();
  expect(unifiReceiptDetails('Account No: 1043057882 Account No: 1043057825').account_number).toBeNull();
  const pending=unifiReceiptDetails('Account No: 1043057882\nPayment Date: 23 Nov 2026\nPayment Status: pending');
  expect(matchUnifiReceipt(pending,invoices)).toBeNull();
});
it('uses an exact invoice reference without guessing a month, and rejects a conflicting account',()=>{
  expect(matchUnifiReceipt(unifiReceiptDetails('Receipt for INV20261122222'),invoices)).toBe('nov');
  expect(matchUnifiReceipt(unifiReceiptDetails('Receipt for INV20261122222 Account No: 1043057825'),invoices)).toBeNull();
  expect(matchUnifiReceipt(unifiReceiptDetails('Receipt for INV20261122222 INV20261022111'),invoices)).toBeNull();
});
it('starts checks exactly 7 days before the due date in Malaysia and keeps overdue bills visible',()=>{
  expect(unifiPaymentFollowups(invoices,[],new Date('2026-12-05T15:59:59Z'))).toEqual([]);
  expect(unifiPaymentFollowups(invoices,[],new Date('2026-12-05T16:00:00Z')).map(row=>row.id)).toEqual(['nov']);
  expect(unifiPaymentFollowups(invoices,[],new Date('2026-12-20T00:00:00Z')).map(row=>row.id)).toEqual(['nov']);
  expect(unifiPaymentFollowups(invoices,[{invoice_id:'nov'}],new Date('2026-12-20T00:00:00Z'))).toEqual([]);
});
it('accepts receipt subjects and strips markup without treating invoice or overdue notices as receipts',()=>{
  expect(isUnifiReceiptSubject("Here's your payment receipt")).toBe(true);
  expect(isUnifiReceiptSubject('Your Unifi bill for Nov 2026 is ready')).toBe(false);
  expect(isUnifiReceiptSubject('Your payment is due')).toBe(false);
  expect(unifiEmailText('<style>ignore</style><p>Account No: 1043057882</p><script>ignore</script>')).toContain('Account No: 1043057882');
  expect(unifiEmailText('<script>ignore</script>')).not.toContain('ignore');
});

it('reads the observed Unifi email receipt template with day-first dates and an AP receipt number',()=>{
 const receipt=unifiReceiptDetails('Payment Receipt\nReceipt\nAP2660253020\nPayment Date\n08-10-2026 16:24:52\nBilling Account 1043057825\nPaid Amount\nRM369.95');
 expect(receipt).toMatchObject({account_number:'1043057825',payment_date:'2026-10-08',receipt_number:'AP2660253020',amount:369.95});
 expect(unifiReceiptDetails('Receipt\nA2667561037\nPayment Date\n11-11-2026 15:13:39\nBilling Account 1043057825\nPaid Amount\nRM369.95')).toMatchObject({payment_date:'2026-11-11',receipt_number:'A2667561037'});
});
