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
  const items = canCreate ? loadRows((from, to) => db.from('inventory_items')
    .select('id,item_code,description,unit,balance_qty,stock_group,inventory_group,quantity_unverified')
    .eq('is_active', true).order('id').range(from, to)) : [];
  const orders = loadRows<PurchaseOrder>((from, to) => db.from('inventory_purchase_orders')
    .select('id,po_no,order_date,requested_by,approved_by,requested_date,approved_date,items,created_at,revision,updated_at,received_quantities,approved_at,approved_by_user,created_by')
    .order('created_at', { ascending: false }).order('id').range(from, to));
  const dispatch = loadRows((from, to) => db.from('inventory_po_dispatch')
    .select('order_id,revision,status,error,sent_at').order('order_id').order('revision').range(from, to));
  const canApprove = canCreate && ['eeab5f04-30c3-42bd-a095-58e56c814358', '1767d3e4-c907-45fe-8ed0-e433c0d0dca7'].includes(profile.id);

  return <AppShell profile={profile} title="Purchase Orders">
    <div className="section-head">
      <div><p className="eyebrow">Inventory</p><h2>Purchase Orders</h2></div>
      <Link className="button secondary-button" href="/admin/inventory">Back to Inventory</Link>
    </div>
    <PurchaseOrders
      items={items}
      orders={orders}
      dispatches={dispatch}
      orderId={query.po}
      draft={canCreate ? query.draft : undefined}
      viewerId={profile.id}
      requester={profile.full_name}
      canCreate={canCreate}
      canApprove={canApprove}
    />
  </AppShell>;
}
