// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  download: vi.fn(), details: vi.fn(), store: vi.fn(), record: vi.fn(), folders: vi.fn(), ids: vi.fn(), opened: vi.fn(),
}));
vi.mock('imapflow', () => ({ ImapFlow: class {
  on() {} close() {} async connect() {}
  list = mocks.folders;
  async getMailboxLock(folder:string) { mocks.opened(folder); return { release() {} }; }
  async search() { return [1, 2]; }
  async fetchAll() { return mocks.ids(mocks.opened.mock.calls.at(-1)?.[0]).map((uid:number) => ({ uid,
    envelope: { from: [{ address: 'noreply@unifi.com.my' }], subject: 'Your Unifi bill for Nov 2026 is ready!' },
    internalDate: new Date('2026-11-22T10:00:00Z'),
    bodyStructure: { part: '1', dispositionParameters: { filename: `INV${uid}.pdf` } },
  })); }
  download = mocks.download;
} }));
vi.mock('./document-review-notifications', () => ({ dispatchDocumentReviewPushes: async () => {} }));
vi.mock('./unifi-webmail-connection', () => ({
  loadUnifiWebmailPassword: async () => 'secret-password', recordUnifiWebmailCheck: mocks.record,
  unifiWebmailAddress: 'project@example.com', unifiWebmailHost: 'mail.example.com',
}));
vi.mock('./unifi-invoices', () => ({ listUnifiInvoices: async () => [], storeUnifiInvoice: mocks.store }));
vi.mock('./unifi-invoice-pdf', () => ({
  unifiBillingMonth: () => '2026-11', unifiFirstBillingMonth: '2026-09', unifiWebmailPdfLimit: 1000,
  unifiFirstPage: async (bytes: Uint8Array) => bytes, unifiInvoiceDetails: mocks.details,
}));
vi.mock('./unifi-receipt-webmail', () => ({syncUnifiReceiptFolder: async () => ({imported:0,errors:0,remaining:0})}));
vi.mock('./unifi-receipts', () => ({rematchUnifiReceipts: async () => {}}));
vi.mock('./supabase/admin', () => ({createAdminClient: () => ({rpc:async()=>({error:null}),from: () => ({update: () => ({eq: async () => ({error:null})})})})}));
import { syncUnifiWebmail } from './unifi-webmail';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.record.mockResolvedValue(undefined);
  mocks.folders.mockResolvedValue([{path:'INBOX'}]);
  mocks.ids.mockReturnValue([1,2]);
  mocks.download.mockImplementation(async () => ({ content: (async function* () { yield Buffer.from('pdf'); })() }));
  mocks.store.mockResolvedValue({ id: 'invoice', created: true });
  mocks.details.mockResolvedValue({ period: '2026-11', invoiceNumber: 'INV2', accountNumber: '1043057825', dueDate: '2026-12-13' });
});
it('imports invoices found only in Junk and deduplicates the same invoice across folders',async()=>{
  mocks.folders.mockResolvedValue([{path:'INBOX'},{path:'INBOX.Junk',specialUse:'\\Junk'}]);
  mocks.ids.mockImplementation((folder:string)=>folder==='INBOX'?[]:[2]);
  expect(await syncUnifiWebmail()).toMatchObject({imported:1,needsReview:0,folders:['INBOX','INBOX.Junk']});
  expect(mocks.store).toHaveBeenCalledWith(expect.objectContaining({sourceMessageId:'INBOX.Junk:unknown:2'}));
  mocks.ids.mockReturnValue([2]);mocks.store.mockClear();
  expect(await syncUnifiWebmail()).toMatchObject({imported:1,needsReview:0});
  expect(mocks.store).toHaveBeenCalledTimes(1);
});
it('identifies a failed attachment and continues importing the next without exposing server errors', async () => {
  mocks.download.mockRejectedValueOnce(Error('IMAP server secret-password'));
  const result = await syncUnifiWebmail();
  expect(result).toMatchObject({ imported: 1, needsReview: 1 });
  expect(mocks.record).toHaveBeenCalledWith('1 invoice attachment(s) could not be imported. INBOX/INV1.pdf: could not download attachment.', true);
  expect(JSON.stringify(result)).not.toContain('secret-password');
});
it('records which invoice metadata failed and does not save an unvalidated invoice', async () => {
  mocks.details.mockResolvedValueOnce({ period: '2026-11', invoiceNumber: 'INV1', accountNumber: '1043057882', dueDate: null });
  const result = await syncUnifiWebmail();
  expect(result).toMatchObject({ imported: 1, needsReview: 1 });
  expect(mocks.record).toHaveBeenCalledWith(expect.stringContaining('INBOX/INV1.pdf: could not validate invoice details (due date).'), true);
  expect(mocks.store).toHaveBeenCalledTimes(1);
});
