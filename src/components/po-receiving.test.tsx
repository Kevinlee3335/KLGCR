import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PurchaseOrders } from './purchase-orders';
import { GoodsReceiving } from './po-receiving';
import type { GoodsReceipt } from '@/lib/purchase-orders/receipts';
import type { PurchaseOrder } from '@/lib/purchase-orders/schema';

vi.mock('./signature-pad', () => ({ SignaturePad: () => null }));

const itemId = 'eaa62e14-be9c-49af-8f83-114d2f74d1eb';
const order: PurchaseOrder = {
  id: '3a690016-44ec-4c3d-9b61-f543326a07a2',
  po_no: '2026-0030',
  order_date: '2026-11-11',
  requested_by: 'Kevin',
  approved_by: 'James',
  requested_date: '2026-11-11',
  approved_date: '2026-11-11',
  approved_at: '2026-11-11T08:00:00Z',
  created_at: '2026-11-11T06:00:00Z',
  items: [{ itemId, code: 'B001', description: 'Paint', unit: 'cans', specification: '', quantity: 10, location: 'Block A' }],
  received_quantities: { [itemId]: 3 },
};
const receipt: GoodsReceipt = {
  id: 'e6ae2a70-b630-49b5-aefb-b9baf4849572',
  order_id: order.id,
  items: [{ itemId, code: 'B001', description: 'Paint', quantity: 3 }],
  received_by: '36e062ed-7ce5-4d64-b1f6-0ea8c10d9f24',
  received_at: '2026-11-11T08:05:00Z',
  note: 'First delivery',
  sheet_status: 'synced',
  sheet_error: null,
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('renders PO receiving progress before fetching receipt history, and reads only the order that opens', async () => {
  const fetchHistory = vi.fn().mockResolvedValue(json({ receipts: [receipt] }));
  vi.stubGlobal('fetch', fetchHistory);
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  render(<PurchaseOrders items={[]} orders={[order]} requester="Kevin" canCreate/>);
  expect(screen.getByText(/Partially Received/)).toBeInTheDocument();
  expect(fetchHistory).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Receive Goods' }));
  expect(await screen.findByText('First delivery')).toBeInTheDocument();
  expect(fetchHistory).toHaveBeenCalledExactlyOnceWith(
    `/api/purchase-orders/receive?orderId=${order.id}`,
    { signal: expect.any(AbortSignal) },
  );
});

it('can retry a failed history load and retains the receiving form', async () => {
  const fetchHistory = vi.fn().mockResolvedValueOnce(json({ error: 'Read failed' }, 503))
    .mockResolvedValueOnce(json({ receipts: [] }));
  vi.stubGlobal('fetch', fetchHistory);
  render(<GoodsReceiving order={order} onUpdate={vi.fn()} onClose={vi.fn()}/>);

  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load receiving history.');
  expect(screen.getByRole('spinbutton', { name: 'Arrival quantity B001' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry History' }));
  expect(await screen.findByText('No deliveries recorded yet.')).toBeInTheDocument();
  expect(fetchHistory).toHaveBeenCalledTimes(2);
});

it('preserves a saved receipt if the earlier history response arrives after stock is updated', async () => {
  let resolveHistory!: (response: Response) => void;
  const history = new Promise<Response>(resolve => { resolveHistory = resolve; });
  const nextOrder = { ...order, received_quantities: { [itemId]: 6 } };
  const newReceipt = { ...receipt, id: 'next-receipt', note: 'Second delivery' };
  const fetcher = vi.fn().mockReturnValueOnce(history).mockResolvedValueOnce(json({
    order: nextOrder, receipt: newReceipt, message: 'Stock saved',
  }));
  vi.stubGlobal('fetch', fetcher);
  const onUpdate = vi.fn();
  render(<GoodsReceiving order={order} onUpdate={onUpdate} onClose={vi.fn()}/>);

  fireEvent.change(screen.getByRole('spinbutton', { name: 'Arrival quantity B001' }), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Received & Update Stock' }));
  expect(await screen.findByText('Stock saved')).toBeInTheDocument();
  expect(onUpdate).toHaveBeenCalledWith(nextOrder);

  await act(async () => resolveHistory(json({ receipts: [newReceipt, receipt] })));
  expect(screen.getAllByText('Second delivery')).toHaveLength(1);
  expect(screen.getByText('First delivery')).toBeInTheDocument();
});
