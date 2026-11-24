// @vitest-environment node
import type { ImapFlow } from 'imapflow';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({list:vi.fn(),store:vi.fn(),pdfText:vi.fn()}));
vi.mock('./unifi-receipts',()=>({listUnifiReceipts:mocks.list,storeUnifiReceipt:mocks.store}));
vi.mock('./unifi-invoice-pdf',()=>({unifiPdfText:mocks.pdfText,unifiWebmailPdfLimit:16777216}));
import { syncUnifiReceiptFolder } from './unifi-receipt-webmail';
function client(){
  const body='Account No: 1043057882\nPayment Date: 23 Nov 2026\nAmount Paid: RM 369.95';
  return {search:vi.fn().mockResolvedValue([1]),mailbox:{uidValidity:1},
    fetchAll:vi.fn().mockResolvedValue([{uid:1,envelope:{from:[{address:'noreply@unifi.com.my'}],subject:'Your payment receipt',messageId:'receipt-1'},
      internalDate:new Date('2026-11-23T08:00:00Z'),bodyStructure:{type:'text/plain',part:'1'}}]),
    fetchOne:vi.fn().mockResolvedValue({source:Buffer.from('Original RFC822 receipt')}),
    download:vi.fn().mockImplementation(async()=>({content:(async function*(){yield Buffer.from(body)})()})),
  };
}
beforeEach(()=>{vi.resetAllMocks();mocks.list.mockResolvedValue([]);mocks.store.mockResolvedValue(true)});
it('archives the original receipt email from Junk and extracts payment evidence from its body',async()=>{
  const mail=client();const result=await syncUnifiReceiptFolder(mail as unknown as ImapFlow,'INBOX.Junk',['noreply@unifi.com.my']);
  expect(result).toEqual({imported:1,errors:0,remaining:0});
  expect(mocks.store).toHaveBeenCalledWith(expect.objectContaining({source_folder:'INBOX.Junk',source_message_id:'receipt-1',
    source:Buffer.from('Original RFC822 receipt'),details:expect.objectContaining({account_number:'1043057882',payment_date:'2026-11-23',amount:369.95})}));
});
it('skips the same archived receipt and its aliases after a folder move',async()=>{
  mocks.list.mockResolvedValue([{source_message_id:'original-id',source_aliases:['receipt-1']}]);
  const mail=client();expect((await syncUnifiReceiptFolder(mail as unknown as ImapFlow,'INBOX',['noreply@unifi.com.my'])).imported).toBe(0);
  expect(mail.fetchOne).not.toHaveBeenCalled();expect(mocks.store).not.toHaveBeenCalled();
});
it('rejects unrelated senders and retains a failed download for the next check',async()=>{
  const mail=client();
  expect((await syncUnifiReceiptFolder(mail as unknown as ImapFlow,'Junk',['other@unifi.com.my'])).imported).toBe(0);
  expect(mail.fetchOne).not.toHaveBeenCalled();
  mail.fetchOne.mockResolvedValue(false);
  expect((await syncUnifiReceiptFolder(mail as unknown as ImapFlow,'Junk',['noreply@unifi.com.my'])).errors).toBe(1);
  expect(mocks.store).not.toHaveBeenCalled();
});
