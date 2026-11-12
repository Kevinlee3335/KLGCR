import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import Page from './page';

const { requireRole, createClient, purchaseOrders } = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createClient: vi.fn(),
  purchaseOrders: vi.fn<(props: unknown) => ReactNode>(),
}));
vi.mock('@/lib/auth', () => ({ requireRole }));
vi.mock('@/lib/supabase/server', () => ({ createClient }));
vi.mock('@/components/app-shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/purchase-orders', () => ({ PurchaseOrders: purchaseOrders }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function client(readPage: (table: string) => Promise<{ data: unknown[]; error?: unknown }>) {
  const from = vi.fn((table: string) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: () => readPage(table),
  }));
  createClient.mockResolvedValue({ from });
  return from;
}

it('starts the stock, order and dispatch reads without waiting on one another or reading receipts', async () => {
  requireRole.mockResolvedValue({ id: 'admin', role: 'admin', full_name: 'Kevin' });
  const rows = {
    inventory_items: [{ id: 'item', item_code: 'OFF-001' }],
    inventory_purchase_orders: [{ id: 'po', po_no: '2026-0030', received_quantities: { item: 3 } }],
    inventory_po_dispatch: [{ order_id: 'po', revision: 1, status: 'sent', inventory_group: 'office' }],
  };
  const release = new Map<string, () => void>();
  purchaseOrders.mockReturnValue(<div>Purchase order list</div>);
  const from = client(table => new Promise(resolve => release.set(table, () => resolve({ data: rows[table as keyof typeof rows] }))));
  const page = Page({ searchParams: Promise.resolve({ po: 'po', draft: '[{"itemId":"item","quantity":2}]' }) });

  await vi.waitFor(() => expect(release.size).toBe(3));
  expect(from.mock.calls).toEqual([['inventory_items'], ['inventory_purchase_orders'], ['inventory_po_dispatch']]);
  release.forEach(done => done());
  render(await page);

  expect(screen.getByText('Purchase order list')).toBeInTheDocument();
  expect(purchaseOrders.mock.calls[0]?.[0]).toMatchObject({
    items: rows.inventory_items,
    initialItems: [{ itemId: 'item', quantity: 2 }],
    initialSearch: '2026-0030',
    orders: rows.inventory_purchase_orders,
    dispatches: rows.inventory_po_dispatch,
  });
});

it('skips the create-only inventory catalog for a viewer', async () => {
  requireRole.mockResolvedValue({ id: 'viewer', role: 'management_viewer', full_name: 'Viewer' });
  const from = client(async () => ({ data: [] }));
  render(await Page({ searchParams: Promise.resolve({}) }));

  expect(from.mock.calls).toEqual([['inventory_purchase_orders'], ['inventory_po_dispatch']]);
  expect(purchaseOrders.mock.calls[0]?.[0]).toMatchObject({ canCreate: false, items: [] });
});
