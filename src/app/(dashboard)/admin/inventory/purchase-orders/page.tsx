import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { PurchaseOrders } from '@/components/purchase-orders';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { PurchaseOrder } from '@/lib/purchase-orders/schema';

const pageSize = 1000;

async function loadRows<Row>(readPage: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>) {
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await readPage(from, from + pageSize - 1);
    if (error || !data) return { rows: [], failed: true };
    rows.push(...data);
    if (data.length < pageSize) return { rows, failed: false };
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ po?: string; draft?: string }> }) {
  const [query, profile] = await Promise.all([searchParams, requireRole(['admin', 'management_viewer'])]);
  const db = await createClient();
  const canCreate = profile.role === 'admin';
  const [inventory, orders, dispatch] = await Promise.all([
    canCreate ? loadRows((from, to) => db.from('inventory_items')
      .select('id,item_code,description,unit,balance_qty,stock_group,inventory_group,quantity_unverified')
      .eq('is_active', true).order('id').range(from, to)) : { rows: [], failed: false },
    loadRows((from, to) => db.from('inventory_purchase_orders')
      .select('id,po_no,order_date,requested_by,approved_by,requested_date,approved_date,items,created_at,revision,updated_at,received_quantities,approved_at,approved_by_user,created_by')
      .order('created_at', { ascending: false }).order('id').range(from, to)),
    loadRows((from, to) => db.from('inventory_po_dispatch')
      .select('order_id,revision,status,inventory_group').order('order_id').order('revision').range(from, to)),
  ]);

  const error = orders.failed ? 'Purchase Order storage is unavailable. Please try again shortly.'
    : inventory.failed ? 'Unable to load inventory items.' : '';
  const items = inventory.rows;
  let initialItems: { itemId: string; quantity: number }[] = [];
  if (canCreate && query.draft) {
    try {
      const draft: unknown = JSON.parse(query.draft);
      if (Array.isArray(draft) && draft.length <= 100) {
        const valid = draft.filter((line): line is { itemId: string; quantity: number } => !!line
          && typeof line.itemId === 'string' && typeof line.quantity === 'number' && Number.isFinite(line.quantity)
          && line.quantity >= 0.01 && line.quantity <= 1000000 && items.some(item => item.id === line.itemId));
        const store = (code: string) => code.startsWith('OFF-') ? 'office' : code.startsWith('CLN-') ? 'cleaner' : 'building';
        if (new Set(valid.map(line => store(items.find(item => item.id === line.itemId)!.item_code))).size <= 1) initialItems = valid;
      }
    } catch {/* Invalid draft links do not affect existing purchase orders. */}
  }
  const canApprove = canCreate && ['eeab5f04-30c3-42bd-a095-58e56c814358', '1767d3e4-c907-45fe-8ed0-e433c0d0dca7'].includes(profile.id);

  return <AppShell profile={profile} title="Purchase Orders">
    <div className="section-head">
      <div><p className="eyebrow">Inventory</p><h2>Purchase Orders</h2></div>
      <Link className="button secondary-button" href="/admin/inventory">Back to Inventory</Link>
    </div>
    {error ? <p className="error">{error}</p> : <PurchaseOrders
      initialItems={initialItems}
      viewerId={profile.id}
      dispatches={dispatch.rows}
      dispatchUnavailable={dispatch.failed}
      initialSearch={orders.rows.find(order => order.id === query.po)?.po_no || ''}
      items={items}
      orders={orders.rows as PurchaseOrder[]}
      requester={profile.full_name}
      canCreate={canCreate}
      canApprove={canApprove}
    />}
  </AppShell>;
}
