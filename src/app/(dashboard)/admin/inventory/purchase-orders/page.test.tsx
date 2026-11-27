import type { ReactNode } from 'react';
import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import Page from './page';

const { requireRole, createClient } = vi.hoisted(() => ({ requireRole: vi.fn(), createClient: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireRole }));
vi.mock('@/lib/supabase/server', () => ({ createClient }));
vi.mock('@/components/app-shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/signature-pad', () => ({ SignaturePad: () => <button>Signature</button> }));

afterEach(() => { vi.clearAllMocks(); });

const rows = {
  inventory_items: [{ id: 'one', item_code: 'OFF-001', description: 'Office paper', unit: 'boxes', balance_qty: 2 }],
  inventory_purchase_orders: [{
    id: 'po', po_no: '2026-0030', approved_at: '2026-10-01T10:00:00Z', approved_by: 'Mary', order_date: '2026-10-01',
    created_at: '2026-10-01T10:00:00Z', revision: 2, requested_by: 'Kevin', requested_date: '2026-10-01', approved_date: '',
    items: [{ itemId: 'one', code: 'OFF-001', description: 'Office paper', unit: 'boxes', quantity: 8, location: '', specification: '' }],
    received_quantities: { one: 3 },
  }],
  inventory_po_dispatch: [
    { order_id: 'po', revision: 1, status: 'previous_revision' },
    { order_id: 'po', revision: 2, status: 'sent' },
  ],
};
type Table = keyof typeof rows;
function database() {
  const gates = new Map<Table, ReturnType<typeof Promise.withResolvers<{ data: unknown[] | null; error?: string }>>>();
  const from = vi.fn((table: Table) => ({
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    range() {
      const gate = Promise.withResolvers<{ data: unknown[] | null; error?: string }>();
      gates.set(table, gate);
      return gate.promise;
    },
  }));
  createClient.mockResolvedValue({ from });
  const finish = (table: Table, failure = false) => gates.get(table)?.resolve(failure ? { data: null, error: 'Failed' } : { data: rows[table] });
  return { from, finish, finishAll: () => { for (const table of gates.keys()) finish(table); } };
}
async function streamPage(query: { po?: string; draft?: string } = {}) {
  const page = await Page({ searchParams: Promise.resolve(query) });
  let html = '';
  const output = new PassThrough();
  output.setEncoding('utf8').on('data', chunk => { html += chunk; });
  const complete = new Promise<string>((resolve, reject) => {
    output.on('end', () => resolve(html)).on('error', reject);
    const stream = renderToPipeableStream(<html><body>{page}</body></html>, { onShellReady: () => stream.pipe(output), onError: reject });
  });
  return { html: () => html, complete };
}

it('streams the linked order, actions and current receipt balance while inventory and dispatch are pending', async () => {
  requireRole.mockResolvedValue({ id: 'admin', role: 'admin', full_name: 'Kevin' });
  const db = database();
  const page = await streamPage({ po: 'po', draft: '[{"itemId":"one","quantity":2}]' });
  try {
    expect(db.from.mock.calls.map(([table]) => table)).toEqual(['inventory_items', 'inventory_purchase_orders', 'inventory_po_dispatch']);
    await vi.waitFor(() => expect(page.html()).toContain('Back to Inventory'));
    db.finish('inventory_purchase_orders');
    await vi.waitFor(() => expect(page.html()).toContain('2026-0030'));
    expect(page.html()).toContain('value="2026-0030"');
    for (const text of ['Review PO', 'Receive Goods', 'Edit', 'Partially Received']) expect(page.html()).toContain(text);
    expect(page.html()).not.toContain('Type win or item code');
    expect(page.html()).not.toContain('Not queued (historical PO)');
    db.finish('inventory_items');
    await vi.waitFor(() => expect(page.html()).toContain('aria-label="Item 1"'));
    expect(page.html()).toMatch(/aria-label="Item 1"[^>]*value="Office paper"/);
    expect(page.html()).toMatch(/aria-label="Quantity 1"[^>]*value="2"/);
  } finally { db.finishAll(); }
  const html = await page.complete;
  expect(html).toMatch(/Delivery: (?:<!-- -->)?sent/);
  expect(html).not.toContain('previous revision');
});

it('keeps the create form usable when saved orders fail and dispatch is pending', async () => {
  requireRole.mockResolvedValue({ id: 'admin', role: 'admin', full_name: 'Kevin' });
  const db = database(), page = await streamPage();
  try {
    db.finish('inventory_items');
    await vi.waitFor(() => expect(page.html()).toContain('aria-label="Item 1"'));
    expect(page.html()).toContain('Save PO');
    db.finish('inventory_purchase_orders', true);
    await vi.waitFor(() => expect(page.html()).toContain('Purchase Order storage is unavailable.'));
  } finally { db.finishAll(); }
  await page.complete;
});

it('skips the create-only catalog for a viewer and isolates dispatch errors from PDF review', async () => {
  requireRole.mockResolvedValue({ id: 'viewer', role: 'management_viewer', full_name: 'Viewer' });
  const db = database(), page = await streamPage();
  expect(db.from.mock.calls.map(([table]) => table)).toEqual(['inventory_purchase_orders', 'inventory_po_dispatch']);
  db.finish('inventory_purchase_orders');
  db.finish('inventory_po_dispatch', true);
  const html = await page.complete;
  expect(html).toContain('Review PO');
  expect(html).toContain('Status unavailable');
  for (const text of ['Create Purchase Order', 'Receive Goods', '>Approve<', '>Edit<']) expect(html).not.toContain(text);
});
