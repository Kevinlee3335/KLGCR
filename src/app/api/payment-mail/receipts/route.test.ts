// @vitest-environment node
import {NextRequest} from 'next/server';
import {beforeEach, expect, it, vi} from 'vitest';
import {PaymentMailError, requirePaymentMailAdmin} from '@/lib/payment-mail/queries';
import {GET} from './route';

const {requestDatabase} = vi.hoisted(() => ({requestDatabase: vi.fn()}));
vi.mock('@/lib/supabase/admin', async () => {
  const {createClient} = await import('@supabase/supabase-js');
  return {createAdminClient: () => createClient('https://database.example.test', 'fake-key', {
    auth: {persistSession: false}, global: {fetch: requestDatabase},
  })};
});
vi.mock('@/lib/payment-mail/queries', () => ({
  requirePaymentMailAdmin: vi.fn(),
  PaymentMailError: class extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
}));

beforeEach(() => { vi.resetAllMocks(); });

it('returns a page of company Receipts with the recorded verifier or manual issuer and searches before paging', async () => {
  const receipt = {receipt_no: 'KLGCR/2600001', payer: 'Test Company', amount: '40.00', description: 'Rental', paid_on: '2026-11-01'};
  requestDatabase.mockResolvedValue(new Response(JSON.stringify([
    {...receipt, id: 'email-receipt', issuer: {full_name: 'Issuer'}, verification: {verifier: {full_name: 'Verifier'}}},
    {...receipt, id: 'manual-receipt', issuer: {full_name: 'Manual Issuer'}, verification: null},
    {...receipt, id: 'legacy-receipt', issuer: null, verification: null},
  ]), {headers: {'Content-Type': 'application/json', 'Content-Range': '25-27/28'}}));
  const page = new URL('https://app.example.test/api/payment-mail/receipts?page=2');
  page.searchParams.set('q', 'ACME, (C. "*")');
  const response = await GET(new NextRequest(page));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({total: 28, items: [
    {...receipt, id: 'email-receipt', amount: 40, verifier_name: 'Verifier'},
    {...receipt, id: 'manual-receipt', amount: 40, verifier_name: 'Manual Issuer'},
    {...receipt, id: 'legacy-receipt', amount: 40, verifier_name: null},
  ]});
  const query = new URL(requestDatabase.mock.calls[0][0]).searchParams;
  expect(query.get('kind')).toBe('in.(rental,utility,billing)');
  expect(query.get('order')).toBe('created_at.desc,id.desc');
  expect(query.get('offset')).toBe('25');
  expect(query.get('limit')).toBe('25');
  const literal = String.raw`"ACME, \\(C\\. \"\\*\"\\)"`;
  expect(query.get('or')).toBe(`(receipt_no.imatch.${literal},payer.imatch.${literal})`);
});

it('denies receipt access before querying the database when the viewer is not an admin', async () => {
  vi.mocked(requirePaymentMailAdmin).mockRejectedValue(new PaymentMailError('Admin permission required', 403));
  const response = await GET(new NextRequest('https://app.example.test/api/payment-mail/receipts'));
  expect(response.status).toBe(403);
  expect(requestDatabase).not.toHaveBeenCalled();
});
