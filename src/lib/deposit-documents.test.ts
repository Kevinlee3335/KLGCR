// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DepositReceiptRecord, PaymentVoucherRecord } from './deposit-documents';

const mocks = vi.hoisted(() => ({
  db: vi.fn(), send: vi.fn(), receiptPdf: vi.fn(), voucherPdf: vi.fn(),
}));
vi.mock('./supabase/admin', () => ({ createAdminClient: mocks.db }));
vi.mock('./finance-mail', () => ({ sendFinancePdf: mocks.send }));
vi.mock('./deposit-document-pdf', () => ({ depositReceiptPdf: mocks.receiptPdf, paymentVoucherPdf: mocks.voucherPdf }));
import { deliverDepositDocument, ensureDepositDocumentPdf, retryDepositDocuments } from './deposit-documents';

type Reply = { data?: unknown; error?: unknown };
type Query = { table: string; values?: Record<string, unknown>; filters: [string, string, unknown][]; expression?: string; selection?: string; limit?: number };
function database(replies: Reply[]) {
  const queries: Query[] = [];
  const download = vi.fn(), upload = vi.fn();
  mocks.db.mockReturnValue({
    from(table: string) {
      const query: Query = { table, filters: [] };
      queries.push(query);
      const chain: Record<string, unknown> = {};
      chain.select = (selection: string) => { query.selection = selection; return chain; };
      chain.update = (values: Record<string, unknown>) => { query.values = values; return chain; };
      for (const operator of ['eq', 'is']) chain[operator] = (column: string, value: unknown) => { query.filters.push([operator, column, value]); return chain; };
      chain.or = (expression: string) => { query.expression = expression; return chain; };
      chain.order = () => chain;
      chain.limit = (value: number) => { query.limit = value; return chain; };
      const resolve = () => {
        if (!replies.length) throw new Error('Unexpected database query');
        return Promise.resolve(replies.shift()!);
      };
      chain.single = chain.maybeSingle = resolve;
      chain.then = (done: (reply: Reply) => unknown, fail: (error: unknown) => unknown) => resolve().then(done, fail);
      return chain;
    },
    storage: { from: vi.fn((bucket: string) => { expect(bucket).toBe('deposit-documents'); return { download, upload }; }) },
  });
  return { queries, download, upload, replies };
}
const file = (bytes: Buffer) => ({ data: { arrayBuffer: async () => bytes }, error: null });
const signature = { strokes: [[[0.1, 0.2], [0.8, 0.6]]] };
function receipt(overrides: Partial<DepositReceiptRecord> = {}): DepositReceiptRecord {
  return {
    id: 'receipt-a', receipt_no: 'KLGDR-2600001', source_module: 'gym', member_id: 'member-a', payer: 'Member A',
    email: 'member@example.test', member_reference: 'GYM-001', amount: '10.00', received_on: '2026-11-25',
    received_by: 'staff-a', received_by_name: 'KEVIN LEE', issuer_signature: null, origin: 'received', original_receipt_no: null,
    note: '', status: 'held', created_at: '2026-11-25T01:00:00Z', pdf_path: null, pdf_error: null,
    email_status: 'pending', email_error: null, emailed_at: null, delivery_claim_token: null, delivery_claimed_at: null,
    ...overrides,
  };
}
function voucher(overrides: Partial<PaymentVoucherRecord> = {}): PaymentVoucherRecord {
  return {
    id: 'voucher-a', voucher_no: 'KLGPV-2600001', source_module: 'gym', deposit_receipt_id: 'receipt-a',
    payer: 'Member A', email: 'member@example.test', member_reference: 'GYM-001', amount: '10.00', paid_on: '2026-11-25',
    refunded_by: 'staff-a', refunded_by_name: 'KEVIN LEE', refund_signature: signature as PaymentVoucherRecord['refund_signature'],
    created_at: '2026-11-25T01:00:00Z', pdf_path: null, pdf_error: null, email_status: 'pending', email_error: null,
    emailed_at: null, delivery_claim_token: null, delivery_claimed_at: null, ...overrides,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.receiptPdf.mockResolvedValue(Buffer.from('new receipt'));
  mocks.voucherPdf.mockResolvedValue(Buffer.from('new voucher'));
  mocks.send.mockResolvedValue(undefined);
});

describe('deposit document archive', () => {
  it('reuses exact archived bytes without re-rendering the issued document', async () => {
    const db = database([]), original = Buffer.from('original issued document');
    db.download.mockResolvedValue(file(original));
    const result = await ensureDepositDocumentPdf('receipt', receipt({ pdf_path: 'receipts/receipt-a.pdf' }));
    expect(result.equals(original)).toBe(true);
    expect(mocks.receiptPdf).not.toHaveBeenCalled();
    expect(db.upload).not.toHaveBeenCalled();
    expect(db.queries).toEqual([]);
  });

  it('recovers an upload whose database status was not saved, without replacing its bytes', async () => {
    const db = database([{ error: null }]), original = Buffer.from('already archived');
    db.download.mockResolvedValue(file(original));
    expect(await ensureDepositDocumentPdf('receipt', receipt())).toEqual(original);
    expect(db.queries[0].values).toEqual({ pdf_path: 'receipts/receipt-a.pdf', pdf_error: null });
    expect(db.queries[0].filters).toContainEqual(['is', 'pdf_path', null]);
    expect(mocks.receiptPdf).not.toHaveBeenCalled();
    expect(db.upload).not.toHaveBeenCalled();
  });

  it('keeps the winning archive when concurrent generation encounters an existing file', async () => {
    const db = database([{ error: null }]), winner = Buffer.from('concurrent first archive');
    db.download.mockResolvedValueOnce({ error: { message: 'not found' } }).mockResolvedValueOnce(file(winner));
    db.upload.mockResolvedValue({ error: { message: 'already exists' } });
    expect(await ensureDepositDocumentPdf('receipt', receipt())).toEqual(winner);
    expect(db.upload).toHaveBeenCalledWith('receipts/receipt-a.pdf', Buffer.from('new receipt'), { contentType: 'application/pdf', upsert: false });
  });

  it('renders a voucher with its immutable actual refunder signature and original receipt number', async () => {
    const db = database([{ data: { receipt_no: 'OLD-123' } }, { error: null }]);
    db.download.mockResolvedValue({ error: { message: 'not found' } });
    db.upload.mockResolvedValue({ error: null });
    await ensureDepositDocumentPdf('voucher', voucher());
    expect(mocks.voucherPdf).toHaveBeenCalledWith(expect.objectContaining({ refunded_by_name: 'KEVIN LEE', refund_signature: signature, original_receipt_no: 'OLD-123', amount: 10 }));
  });
});

describe('deposit document delivery', () => {
  it('never emails an existing opening deposit even if its email status incorrectly says pending', async () => {
    const db = database([{ data: receipt({ origin: 'existing', original_receipt_no: 'OLD-123', pdf_path: 'receipts/receipt-a.pdf' }) }, { error: null }]);
    db.download.mockResolvedValue(file(Buffer.from('existing record')));
    expect(await deliverDepositDocument('receipt', 'receipt-a')).toEqual({ status: 'not_required' });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(db.queries[1].values).toEqual({ email_status: 'not_required', delivery_claimed_at: expect.any(String) });
    expect(Number.isFinite(Date.parse(String(db.queries[1].values?.delivery_claimed_at)))).toBe(true);
  });

  it('does not send or render when another request holds the delivery claim', async () => {
    const db = database([{ data: receipt() }, { data: null, error: null }]);
    expect(await deliverDepositDocument('receipt', 'receipt-a')).toEqual({ status: 'sending' });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(db.download).not.toHaveBeenCalled();
    expect(db.queries[1].expression).toContain('email_status.eq.sending,delivery_claimed_at.lt.');
  });

  it('keeps a refunded cash record intact when email fails and scopes failure to its own claim', async () => {
    const row = voucher({ pdf_path: 'vouchers/voucher-a.pdf' });
    const db = database([{ data: row }, { data: { ...row, email_status: 'sending' } }, { error: null }]);
    db.download.mockResolvedValue(file(Buffer.from('issued voucher')));
    mocks.send.mockRejectedValueOnce(new Error('Gateway unavailable'));
    expect(await deliverDepositDocument('voucher', row.id)).toEqual({ status: 'failed', error: 'Gateway unavailable' });
    const claim = db.queries[1], failure = db.queries[2];
    expect(failure.values).toEqual({ email_status: 'failed', email_error: 'Gateway unavailable', delivery_claim_token: null });
    expect(failure.filters).toContainEqual(['eq', 'delivery_claim_token', claim.values?.delivery_claim_token]);
    expect(failure.filters).toContainEqual(['eq', 'email_status', 'sending']);
    expect(db.queries.every(query => query.table === 'payment_vouchers')).toBe(true);
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ key: 'deposit_document_voucher_voucher-a', pdf: Buffer.from('issued voucher') }));
    expect(failure.values).not.toHaveProperty('delivery_claimed_at');
  });

  it('marks sent only after gateway confirmation and uses a stable delivery key for retries', async () => {
    const row = receipt({ pdf_path: 'receipts/receipt-a.pdf' });
    const db = database([{ data: row }, { data: { ...row, email_status: 'sending' } }, { data: { id: row.id } }]);
    db.download.mockResolvedValue(file(Buffer.from('issued receipt')));
    expect(await deliverDepositDocument('receipt', row.id)).toEqual({ status: 'sent' });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ key: 'deposit_document_receipt_receipt-a', to: 'member@example.test', fileName: 'KLGDR-2600001.pdf' }));
    const claimed = db.queries[1], sent = db.queries[2];
    expect(sent.values?.email_status).toBe('sent');
    expect(sent.filters).toContainEqual(['eq', 'delivery_claim_token', claimed.values?.delivery_claim_token]);
  });

  it('shares a bounded retry batch across receipts and vouchers so receipt failures cannot starve refunds', async () => {
    const db = database([
      { data: [{ id: 'r1' }, { id: 'r2' }] }, { data: [{ id: 'v1' }, { id: 'v2' }] },
      { data: receipt({ id: 'r1', email_status: 'sent' }) }, { data: voucher({ id: 'v1', email_status: 'sent' }) },
      { data: receipt({ id: 'r2', email_status: 'sent' }) }, { data: voucher({ id: 'v2', email_status: 'sent' }) },
    ]);
    expect(await retryDepositDocuments(4)).toEqual({ attempted: 4, sent: 4 });
    expect(db.queries.slice(0, 2).map(query => [query.table, query.limit])).toEqual([['deposit_receipts', 2], ['payment_vouchers', 2]]);
    expect(db.queries.slice(2).map(query => query.filters[0][2])).toEqual(['r1', 'v1', 'r2', 'v2']);
    expect(db.queries[0].expression).toContain('email_status.eq.failed,or(delivery_claimed_at.is.null,delivery_claimed_at.lt.');
    expect(db.queries[0].expression).toContain('email_status.eq.not_required,pdf_path.is.null,or(delivery_claimed_at.is.null,delivery_claimed_at.lt.');
    expect(mocks.send).not.toHaveBeenCalled();
    expect(db.replies).toHaveLength(0);
  });
});
