import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { GET } from './route';

const { getSessionProfile, createClient } = vi.hoisted(() => ({
  getSessionProfile: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ getSessionProfile }));
vi.mock('@/lib/supabase/server', () => ({ createClient }));
vi.mock('@/lib/purchase-orders/receipt-sync', () => ({ syncGoodsReceipt: vi.fn() }));

const orderId = '3a690016-44ec-4c3d-9b61-f543326a07a2';
function request(id: string) {
  return new NextRequest(`https://klgcr.example/api/purchase-orders/receive?orderId=${id}`);
}

beforeEach(() => {
  vi.resetAllMocks();
  getSessionProfile.mockResolvedValue({ role: 'admin' });
});

it.each([null, { role: 'management_viewer' }, { role: 'maintenance_staff' }])('checks receiving access before querying (%j)', async (profile) => {
  getSessionProfile.mockResolvedValue(profile);
  expect((await GET(request(orderId))).status).toBe(403);
  expect(createClient).not.toHaveBeenCalled();
});

it('rejects an invalid order ID before querying', async () => {
  expect((await GET(request('invalid'))).status).toBe(400);
  expect(createClient).not.toHaveBeenCalled();
});

it('returns only the selected order history in deterministic pages', async () => {
  const firstPage = Array.from({ length: 1000 }, (_, i) => ({ id: `receipt-${i}`, order_id: orderId }));
  const secondPage = [{ id: 'receipt-1000', order_id: orderId }];
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValueOnce({ data: firstPage }).mockResolvedValueOnce({ data: secondPage }),
  };
  const from = vi.fn().mockReturnValue(query);
  createClient.mockResolvedValue({ from });

  const response = await GET(request(orderId));

  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ receipts: [...firstPage, ...secondPage] });
  expect(from.mock.calls).toEqual([['inventory_po_receipts'], ['inventory_po_receipts']]);
  expect(query.eq.mock.calls).toEqual([['order_id', orderId], ['order_id', orderId]]);
  expect(query.order.mock.calls.slice(0, 2)).toEqual([['received_at', { ascending: false }], ['id']]);
  expect(query.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
});

it('reports a read error distinctly from an order without deliveries', async () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ error: { message: 'Database unavailable' } }),
  };
  createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(query) });
  expect((await GET(request(orderId))).status).toBe(503);
});
