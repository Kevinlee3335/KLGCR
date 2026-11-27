import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PurchaseOrders } from './purchase-orders';
import type { PurchaseOrder } from '@/lib/purchase-orders/schema';
import { writePODraft } from '@/lib/po-draft';

vi.mock('./signature-pad', () => ({ SignaturePad: () => null }));
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

const item = { id: 'office-item', item_code: 'OFF-001', description: 'Office paper', unit: 'box' };
const building = { id: 'cement', item_code: 'B001', description: 'Cement', unit: 'bag' };
const previous: PurchaseOrder = {
  id: 'previous', po_no: '2026-0002', order_date: '2026-10-01', created_at: '2026-10-01T10:00:00Z',
  requested_date: '2026-10-01', requested_by: 'Mary', approved_date: '', approved_by: '', revision: 2,
  items: [{ itemId: item.id, code: item.item_code, description: item.description, unit: item.unit, quantity: 2, location: '', specification: '' }],
};

it('edits a historical line absent from the active catalog and keeps its revision and PDF after saving', async () => {
  vi.stubGlobal('scrollTo', vi.fn());
  const saved = { ...previous, revision: 3, items: [{ ...previous.items[0], quantity: 4 }] };
  const post = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ order: saved }) });
  vi.stubGlobal('fetch', post);
  render(<PurchaseOrders items={[building]} orders={[previous]} requester="Kevin" canCreate />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.getByLabelText('Inventory')).toHaveValue('office');
  expect(screen.getByLabelText('Requested by')).toHaveValue('Mary');
  expect(screen.getByLabelText('Item 1')).toHaveValue('Office paper');
  fireEvent.change(screen.getByLabelText('Quantity 1'), { target: { value: '4' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Save Changes' }).closest('form')!);
  await screen.findByText('Revision 3 · Awaiting Delivery');
  expect(JSON.parse(post.mock.calls[0][1].body)).toMatchObject({
    orderId: previous.id, expectedRevision: 2, useSignature: true, requestedDate: previous.requested_date,
    items: [{ itemId: item.id, quantity: 4 }],
  });
  expect(screen.getAllByRole('link', { name: 'Review PO' }).every(link =>
    link.getAttribute('href') === '/api/purchase-orders/previous/pdf?view=1')).toBe(true);
});

it('recovers the stored single-warehouse draft after rejecting a mixed-warehouse link', () => {
  writePODraft('building', [{ itemId: building.id, quantity: 7 }]);
  const draft = JSON.stringify([{ itemId: item.id, quantity: 10 }, { itemId: building.id, quantity: 15 }]);
  render(<PurchaseOrders items={[item, building]} orders={[]} requester="Kevin" canCreate draft={draft} />);
  expect(screen.getByLabelText('Inventory')).toHaveValue('building');
  expect(screen.getByLabelText('Item 1')).toHaveValue('Cement');
  expect(screen.getByLabelText('Quantity 1')).toHaveValue(7);
  expect(screen.queryByLabelText('Item 2')).toBeNull();
});

it('retains the PO saved while its historical list is still in flight', async () => {
  const history = Promise.withResolvers<{ rows: PurchaseOrder[]; failed: boolean }>();
  const saved = { ...previous, id: 'new', po_no: '2026-0003' };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ order: saved }) }));
  await act(async () => {
    render(<PurchaseOrders items={[item]} orders={history.promise} requester="Kevin" canCreate initialItems={[{ itemId: item.id, quantity: 2 }]} />);
  });
  await act(async () => {
    fireEvent.submit(screen.getByRole('button', { name: 'Save PO' }).closest('form')!);
  });
  await screen.findByText(/2026-0003 saved successfully/);
  await act(async () => history.resolve({ rows: [previous], failed: false }));
  expect(screen.getByText('2026-0002')).toBeInTheDocument();
  expect(screen.getByText('2026-0003')).toBeInTheDocument();
});
