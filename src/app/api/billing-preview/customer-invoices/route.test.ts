// @vitest-environment node
import {NextRequest} from 'next/server';
import {beforeEach, expect, it, vi} from 'vitest';
import {POST} from './route';

const {from, rpc, storageFrom, gmailGateway, sendFinancePdf} = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), storageFrom: vi.fn(), gmailGateway: vi.fn(), sendFinancePdf: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({getSessionProfile: async () => ({id: 'admin-1', role: 'admin'})}));
vi.mock('@/lib/supabase/admin', () => ({createAdminClient: () => ({from, rpc, storage: {from: storageFrom}})}));
vi.mock('@/lib/billing-mail', () => ({gmailGateway}));
vi.mock('@/lib/finance-mail', () => ({sendFinancePdf}));

const origin = 'https://example.test';
const id = '11111111-1111-4111-8111-111111111111';
const request = (body: string | FormData) => new NextRequest(`${origin}/api/billing-preview/customer-invoices`, {
  method: 'POST', headers: typeof body === 'string' ? {origin, 'Content-Type': 'application/json'} : {origin}, body,
});

beforeEach(() => vi.resetAllMocks());

it('rejects a new November invoice draft before looking up invoices or archiving any PDF', async () => {
  const form = new FormData();
  form.set('source', new File(['%PDF-1.7'], 'scan.pdf', {type: 'application/pdf'}));
  form.set('mapping', JSON.stringify({
    period: '2026-11', rental: {runId: id, lineIndex: 0, page: 1, invoiceNo: 'NOV-1'}, utility: null, email: '',
  }));

  const result = await POST(request(form));
  expect(result.status).toBe(409);
  expect(await result.json()).toEqual({error: 'November 2026 customer invoices were already sent manually.'});
  expect(from).not.toHaveBeenCalled();
  expect(storageFrom).not.toHaveBeenCalled();
});

it('rejects a direct November send or retry based on its saved period, before claiming delivery', async () => {
  const maybeSingle = vi.fn().mockResolvedValue({data: {period: '2026-11'}, error: null});
  const eq = vi.fn().mockReturnValue({maybeSingle});
  const select = vi.fn().mockReturnValue({eq});
  from.mockReturnValue({select});

  const result = await POST(request(JSON.stringify({action: 'send', id, period: '2026-12'})));
  expect(result.status).toBe(409);
  expect(await result.json()).toEqual({error: 'November 2026 customer invoices were already sent manually.'});
  expect(eq).toHaveBeenCalledWith('id', id);
  expect(rpc).not.toHaveBeenCalled();
  expect(gmailGateway).not.toHaveBeenCalled();
  expect(sendFinancePdf).not.toHaveBeenCalled();
});

it('still delivers a confirmed December invoice using the existing noreply path', async () => {
  const pack = {id, period: '2026-12', company_name: 'Example', recipient: 'company@example.test', file_name: 'invoice.pdf', attempted_at: '2026-12-01T00:00:00Z'};
  const sent = {...pack, status: 'sent'};
  const selection = {eq: vi.fn().mockReturnValue({maybeSingle: vi.fn().mockResolvedValue({data: {period: pack.period}, error: null})})};
  const updated = {eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnValue({maybeSingle: vi.fn().mockResolvedValue({data: sent, error: null})})};
  from.mockReturnValue({select: vi.fn().mockReturnValue(selection), update: vi.fn().mockReturnValue(updated)});
  rpc.mockResolvedValue({data: pack, error: null});
  storageFrom.mockReturnValue({download: vi.fn().mockResolvedValue({data: new Blob(['%PDF-1.7']), error: null})});
  gmailGateway.mockResolvedValue({ok: true, sender: 'klgcr.noreply@gmail.com', capabilities: ['customerInvoicePdf']});

  const result = await POST(request(JSON.stringify({action: 'send', id})));
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual(sent);
  expect(rpc).toHaveBeenCalledWith('claim_billing_customer_invoice_delivery', {p_id: id, p_admin: 'admin-1'});
  expect(sendFinancePdf).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({key: `invoice_${id}`, to: pack.recipient, fileName: pack.file_name}));
});
