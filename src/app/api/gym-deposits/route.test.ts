// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ profile: vi.fn(), admin: vi.fn(), rpc: vi.fn(), after: vi.fn(), deliver: vi.fn(), pdf: vi.fn(), load: vi.fn() }));
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), after: mocks.after }));
vi.mock('@/lib/auth', () => ({ getSessionProfile: mocks.profile }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/deposit-documents', () => ({ deliverDepositDocument: mocks.deliver, ensureDepositDocumentPdf: mocks.pdf, loadDepositDocument: mocks.load }));
import { GET, POST } from './route';

const actor = '71001111-1111-4111-8111-111111111111';
const member = '72002222-2222-4222-8222-222222222222';
const receipt = '73003333-3333-4333-8333-333333333333';
const voucher = '74004444-4444-4444-8444-444444444444';
const requestId = '75005555-5555-4555-8555-555555555555';
const signature = { strokes: [[[0, 0], [.5, .5], [1, 1]]] };
type Query = { table: string; operations: [string, ...unknown[]][] };
let queries: Query[];
let receiptRows: Record<string, unknown>[];
let voucherRows: Record<string, unknown>[];
let heldCount: number;

function get(params: Record<string, string> = {}) {
  return new NextRequest(`https://app.example.test/api/gym-deposits?${new URLSearchParams(params)}`);
}
function post(body: unknown, origin = 'https://app.example.test') {
  return new NextRequest('https://app.example.test/api/gym-deposits', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function receive(patch: Record<string, unknown> = {}) {
  return { action: 'receive', request_id: requestId, member_id: member, received_on: '2026-11-25', ...patch };
}
function query(table: string) {
  const record: Query = { table, operations: [] };
  queries.push(record);
  const result = () => {
    if (table === 'user_e_signatures') return { data: { signature }, error: null };
    const selection = record.operations.find(([name]) => name === 'select');
    if ((selection?.[2] as {head?: boolean} | undefined)?.head) return { data: null, count: heldCount, error: null };
    return { data: table === 'deposit_receipts' ? receiptRows : voucherRows, count: table === 'deposit_receipts' ? receiptRows.length : voucherRows.length, error: null };
  };
  const builder: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'gte', 'lte', 'order', 'range', 'or', 'limit']) builder[name] = (...args: unknown[]) => { record.operations.push([name, ...args]); return builder; };
  builder.maybeSingle = () => Promise.resolve(result());
  builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
  return builder;
}

beforeEach(() => {
  vi.resetAllMocks();
  queries = [];
  receiptRows = [{ id: receipt, receipt_no: 'KLGDR-2600001', status: 'refunded', pdf_path: `receipts/${receipt}.pdf`, payment_vouchers: [{ id: voucher, voucher_no: 'KLGPV-2600001' }] }];
  voucherRows = [{ id: voucher, voucher_no: 'KLGPV-2600001', pdf_path: `vouchers/${voucher}.pdf`, deposit_receipts: { member_id: member, receipt_no: 'KLGDR-2600001' } }];
  heldCount = 1;
  mocks.profile.mockResolvedValue({ id: actor, role: 'admin', full_name: 'Current staff', is_active: true });
  mocks.rpc.mockResolvedValue({ data: { receivedAmount: 10, openingAmount: 0, refundedAmount: 0, heldAmount: 10, heldCount: 1 }, error: null });
  mocks.admin.mockReturnValue({ from: query, rpc: mocks.rpc });
  mocks.deliver.mockResolvedValue({ status: 'sent' });
  mocks.pdf.mockResolvedValue(Buffer.from('%PDF-archived'));
  mocks.load.mockResolvedValue({ id: receipt, source_module: 'gym', email_status: 'failed' });
});

describe('gym deposit access and DTOs', () => {
  it.each([null, { role: 'gym_patrol' }, { role: 'maintenance_staff' }])('denies list and mutation access to unauthorized profiles (%o)', async profile => {
    mocks.profile.mockResolvedValue(profile);
    expect((await GET(get())).status).toBe(403);
    expect((await POST(post(receive()))).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('allows management viewing but rejects all management mutations', async () => {
    mocks.profile.mockResolvedValue({ id: actor, role: 'management_viewer', full_name: 'Viewer' });
    const result = await (await GET(get())).json();
    expect(result).toMatchObject({ canManage: false, signatureReady: false });
    expect(queries.some(q => q.table === 'user_e_signatures')).toBe(false);
    expect((await POST(post(receive()))).status).toBe(403);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('returns linked PV independently of its current list page and keeps private storage/signature fields server-side', async () => {
    voucherRows = [];
    const response = await GET(get({ member, q: 'some filter', page: '3', status: 'refunded' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toMatchObject({ actorName: 'Current staff', signatureReady: true, memberHasHeldDeposit: true });
    expect(body.receipts[0]).toMatchObject({ pdf_ready: true, voucher_id: voucher, voucher_no: 'KLGPV-2600001' });
    expect(body.receipts[0]).not.toHaveProperty('pdf_path');
    expect(body.receipts[0]).not.toHaveProperty('payment_vouchers');
    const selection = queries.filter(q => q.table !== 'user_e_signatures').flatMap(q => q.operations.filter(([op]) => op === 'select').map(([, cols]) => String(cols)));
    expect(selection.join(',')).not.toMatch(/issuer_signature|refund_signature|delivery_claim/);
    const held = queries.find(q => q.table === 'deposit_receipts' && q.operations.some(([op, , options]) => op === 'select' && (options as {head?: boolean})?.head));
    expect(held?.operations).toContainEqual(['eq', 'member_id', member]);
    expect(held?.operations).toContainEqual(['eq', 'status', 'held']);
    expect(held?.operations.some(([op]) => ['range', 'or'].includes(op))).toBe(false);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it('flattens the original receipt relationship on voucher rows', async () => {
    const body = await (await GET(get({ kind: 'vouchers' }))).json();
    expect(body.vouchers[0]).toMatchObject({ original_receipt_no: 'KLGDR-2600001', member_id: member, pdf_ready: true });
    expect(body.vouchers[0]).not.toHaveProperty('deposit_receipts');
    expect(body.vouchers[0]).not.toHaveProperty('pdf_path');
  });

  it.each<Record<string, string>>([{ member: 'not-a-uuid' }, { page: '0' }, { from: '2026-11-25', to: '2026-11-01' }, { kind: 'all' }])('rejects invalid filters before database use (%o)', async filters => {
    expect((await GET(get(filters))).status).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});

describe('gym deposit mutations', () => {
  it('rejects foreign origins, oversized bodies and caller-supplied signature or actor fields', async () => {
    expect((await POST(post(receive(), 'https://foreign.example.test'))).status).toBe(403);
    for (const extra of [{ actor_id: actor }, { refunded_by_name: 'Fake' }, { member_signature: signature }]) {
      expect((await POST(post(receive(extra)))).status).toBe(400);
    }
    expect((await POST(post(receive({ note: 'x'.repeat(6100) })))).status).toBe(413);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('records cash using the server actor and caller idempotency ID, then queues document delivery', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: requestId, receipt_no: 'KLGDR-2600001', email_status: 'pending' }, error: null });
    const response = await POST(post(receive()));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: requestId, receipt_no: 'KLGDR-2600001', document_kind: 'receipt', mail: 'pending' });
    expect(mocks.rpc).toHaveBeenCalledWith('record_gym_deposit', { p_id: requestId, p_member: member, p_actor: actor, p_received_on: '2026-11-25', p_origin: 'received', p_original_receipt_no: '', p_note: '' });
    expect(mocks.deliver).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.deliver).toHaveBeenCalledWith('receipt', requestId);
  });

  it('preserves historical receipt data and leaves automatic email suppression to the stored document', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: requestId, receipt_no: 'OLD-100', email_status: 'not_required' }, error: null });
    const response = await POST(post(receive({ origin: 'existing', original_receipt_no: ' OLD-100 ', received_on: '2025-01-02', note: ' Opening balance ' })));
    expect((await response.json()).mail).toBe('not_required');
    expect(mocks.rpc).toHaveBeenCalledWith('record_gym_deposit', expect.objectContaining({ p_origin: 'existing', p_original_receipt_no: 'OLD-100', p_received_on: '2025-01-02', p_note: 'Opening balance' }));
  });

  it('returns the original refund and actual refunding employee when another tab retries', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: voucher, voucher_no: 'KLGPV-2600001', email_status: 'failed', refunded_by_name: 'First refunding staff' }, error: null });
    const response = await POST(post({ action: 'refund', request_id: requestId, deposit_id: receipt }));
    expect(await response.json()).toMatchObject({ id: voucher, voucher_no: 'KLGPV-2600001', already_refunded: true, refunded_by_name: 'First refunding staff', mail: 'failed' });
    expect(mocks.rpc).toHaveBeenCalledWith('refund_gym_deposit', { p_id: requestId, p_deposit: receipt, p_actor: actor });
    await mocks.after.mock.calls[0][0]();
    expect(mocks.deliver).toHaveBeenCalledWith('voucher', voucher);
  });

  it('does not queue delivery if the transactional cash RPC rejects the operation', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'A deposit is already held for this member.' } });
    const response = await POST(post(receive()));
    expect(response.status).toBe(409);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('retries an existing document without recording another cash transaction', async () => {
    const response = await POST(post({ action: 'retry_pdf', document_kind: 'receipt', id: receipt }));
    expect(response.status).toBe(200);
    expect(mocks.load).toHaveBeenCalledWith('receipt', receipt);
    expect(mocks.pdf).toHaveBeenCalledWith('receipt', expect.objectContaining({ id: receipt }));
    expect(mocks.rpc).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.deliver).toHaveBeenCalledWith('receipt', receipt);
  });

  it('cannot access future non-gym documents through the gym retry endpoint', async () => {
    mocks.load.mockResolvedValue({ id: receipt, source_module: 'rental' });
    expect((await POST(post({ action: 'resend', document_kind: 'receipt', id: receipt }))).status).toBe(404);
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
