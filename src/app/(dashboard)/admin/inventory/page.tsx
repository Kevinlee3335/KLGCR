/* eslint-disable @typescript-eslint/no-explicit-any */
import { activeCheckoutBatch } from "@/lib/checkout-batches.server";
import { AppShell } from "@/components/app-shell";
import { ItemsToOrder } from "@/components/items-to-order";
import { InventoryItemFinder } from "@/components/inventory-item-finder";
import { InventoryNewItem } from "@/components/inventory-new-item";
import { InventorySearchInput } from "./inventory-search-input";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OfficeUsageSection } from "@/components/office-usage-section";
import { StockOutItemPicker } from "@/components/stock-out-item-picker";
import { Fragment, Suspense } from "react";
import Link from "next/link";
import type { PostgrestError } from "@supabase/supabase-js";
import { procurementRows } from "@/lib/inventory-procurement";
import type { InventoryStore } from "@/lib/inventory-new-item";

const issueDate = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric" });
const adjustmentTime = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });
const inventoryGroups = ["Office Inventory", "Cleaner Supplies", "Building", "Electrical", "Chemical", "Piping", "Painting"];
const inventoryCatalogColumns = "id,item_code,description,category,balance_qty,reorder_level,unit,quantity_unverified,is_active,stock_group,procurement_mode";

async function readInventoryRows<Row>(readPage: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: PostgrestError | null }>) {
  const rows: Row[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await readPage(from, from + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
}

function stockState(balance: number, reorder: number) {
  if (balance <= 0) return "Out of Stock";
  if (balance <= reorder) return "Near Reorder";
  return "In Stock";
}

function qtyToOrder(balance: number, reorder: number) {
  return Math.max(0, reorder - balance);
}

type InventoryQuery = {
  error?: string;
  success?: string;
  warning?: string;
  q?: string;
  category?: string;
  view?: string;
  store?: string;
  usagePage?: string;
  usageQ?: string;
  purchaseView?: string;
};

type InventoryClient = Awaited<ReturnType<typeof createClient>>;

function readStoreInventory(supabase: InventoryClient, store: InventoryStore, search: string, category: string, viewAll: boolean) {
  const catalogQuery = supabase.from("inventory_items").select(inventoryCatalogColumns).eq("inventory_group", store).order("item_code").order("id");
  let stockQuery = supabase.from("inventory_items").select(`${inventoryCatalogColumns},movement_category,cost,source_details`).eq("inventory_group", store).order("item_code").order("id");
  if (search) {
    // Quote PostgREST operands: names such as WINDOW HANDLE (L) contain filter syntax.
    const pattern = `"%${search.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}%"`;
    stockQuery = stockQuery.or(`item_code.ilike.${pattern},description.ilike.${pattern}`);
  }
  if (category) stockQuery = stockQuery.eq("category", category);
  const readCatalog = () => readInventoryRows((from, to) => catalogQuery.range(from, to));
  const stock = search || category || viewAll ? readInventoryRows((from, to) => stockQuery.range(from, to)) : null;
  // View All already contains every catalog field. A failed detail read can still recover the basic catalog.
  const catalog = stock && !search && !category
    ? stock.then(result => result.error ? readCatalog() : result)
    : readCatalog();
  return { catalog, stock };
}

type Reads = ReturnType<typeof readStoreInventory>;
type Catalog = ReturnType<typeof prepareCatalog>;

async function prepareCatalog(source: Reads["catalog"]) {
  const { data, error } = await source;
  const allItems = data ?? [];
  const active = allItems.filter(item => item.is_active);
  const codes = allItems.map(({ item_code, description, category }) => ({ item_code, description, category }));
  const activeCodes = codes.filter((_, index) => allItems[index].is_active);
  const picker = active.map(({ id, item_code, description, balance_qty, unit, quantity_unverified }) => ({
    id, item_code, description, balance_qty, unit, quantity_unverified,
  }));
  // Only rows in one of the two purchase tabs can be selected or have their mode changed.
  const purchases = procurementRows(active).filter(row => row.needsOrder || row.buyWhenNeeded);
  return { error, codes, activeCodes, picker, purchases };
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<InventoryQuery> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const [query, supabase] = await Promise.all([searchParams, createClient()]);
  const store = query.store === "office" ? "office" : query.store === "cleaner" ? "cleaner" : "building";
  const storeTitle = { building: "Building Material", office: "Office Inventory", cleaner: "Cleaner Supplies" }[store];
  const base = `/admin/inventory?store=${store}`;
  const search = (query.q || "").trim();
  const category = inventoryGroups.includes(query.category || "") ? query.category! : "";
  const { catalog: catalogRows, stock } = readStoreInventory(supabase, store, search, category, query.view === "all");
  const catalog = prepareCatalog(catalogRows);
  const suggestions = catalog.then(result => result.activeCodes);
  const canManage = profile.role === "admin";
  const hasStockFilter = Boolean(stock);

  return <AppShell profile={profile} title={storeTitle}>
    <Fragment key={store}>
      <div className="section-head inventory-heading"><div><p className="eyebrow">Inventory Control</p><h2>{storeTitle}</h2><p className="subtle">Monitor stock levels, reorder requirements and material movement.</p></div></div>
      {query.warning && <p className="error">{query.warning}</p>}{query.error && <p className="error">{query.error}</p>}{query.success && <p className="success">{query.success === "buy_when_needed" ? "Selected materials saved as Buy When Needed and hidden from Items to Order." : query.success === "maintain_stock" ? "Stock alerts restored. Materials appear when stock reaches the reorder point." : query.success === "stock_out" ? "Stock Out saved successfully. Stock balance and history updated." : "Inventory saved successfully."}</p>}
      {store === "office" && <OfficeUsageSection profile={profile} page={query.usagePage} search={query.usageQ} base={base}
        catalog={catalog.then(result => result.error ? { error: true as const } : { items: result.picker })} />}
      <section className="panel"><div className="section-head"><div><h3>Purchase Orders</h3><p className="subtle">Create a PO from Inventory items and save a PDF for HQ.</p></div><Link className="button" href="/admin/inventory/purchase-orders">Purchase Orders</Link></div></section>
      <section className="inventory-kpis">
        <Suspense key={`${search}-${category}-${hasStockFilter}`} fallback={<StockMetrics total="…" near="…" out="…" />}>
          <StockCounts rows={stock ?? catalogRows} />
        </Suspense>
        <article className="gold"><span>Need to Order</span><strong><Suspense fallback="…"><OrderCount catalog={catalog} /></Suspense></strong><small>Items recommended for purchase</small></article>
      </section>
      <section id="items-to-order" className="panel inventory-order-panel">
        <div className="section-head compact-head"><div><h3>Items to Order</h3><p className="subtle">Combined brand stock and purchase reminders. Select materials to buy only when needed.</p></div></div>
        <Suspense fallback={<p className="subtle" role="status">Loading purchase list…</p>}>
          <PurchaseList catalog={catalog} store={store} canManage={canManage} view={query.purchaseView} />
        </Suspense>
      </section>

      {canManage && <section className="panel inventory-form-card">
        <div className="section-head compact-head"><div><h3>Add Inventory Item</h3><p className="subtle">Find an existing item or create a new one with automatic category and item code.</p></div>
          <Suspense fallback={<button className="button" disabled>New Item</button>}><NewItem catalog={catalog} store={store} /></Suspense>
        </div>
        <Suspense fallback={<p className="subtle" role="status">Loading item finder…</p>}><ItemFinder catalog={catalog} store={store} /></Suspense>
      </section>}

      <section id="inventory-stock-list" className="panel inventory-stock-card">
        <div className="section-head compact-head">
          <div><h3>Stock List</h3><p className="subtle">Grouped by store category and ordered by Item Code.</p></div>
          <Link className="button secondary-button" prefetch={false} aria-expanded={hasStockFilter}
            href={hasStockFilter ? `${base}#inventory-stock-list` : `${base}&view=all#inventory-stock-list`}>
            {hasStockFilter ? "Hide List" : "View All"}
          </Link>
        </div>
        <form method="get" className="inventory-form inventory-search">
          <input type="hidden" name="store" value={store} />
          <label className="span-2"><span>Search Item Code or Description</span>
            <InventorySearchInput key={search} search={search} suggestions={suggestions} />
          </label>
          <label><span>Inventory Group</span>
            <select name="category" defaultValue={category}>
              <option value="">All groups</option>
              {inventoryGroups.map(group => <option key={group} value={group}>{group}</option>)}
            </select>
          </label>
          <div>
            <button className="button" type="submit">Search</button>
            {(search || category) && <>
              <Link className="button secondary-button" prefetch={false} href={`${base}&view=all#inventory-stock-list`}>View All</Link>
              <Link className="button secondary-button" prefetch={false} href={base}>Clear</Link>
            </>}
          </div>
        </form>
        {stock ? <Suspense key={JSON.stringify([search, category, query.view])} fallback={<p className="subtle" role="status">Loading stock list…</p>}>
          <StockResults stock={stock} store={store} category={category} canManage={canManage} />
        </Suspense> : <p className="dashboard-empty">Click View All to see the full stock list, or select an inventory group / search by Item Code or name.</p>}
      </section>
      {canManage && <section className="panel inventory-form-card" id="stock-out">
        <div className="section-head compact-head"><div><p className="eyebrow">Stock Movement</p><h3>Stock Out</h3><p className="subtle">Record materials collected by General Staff or other recipients.</p></div><Link className="button secondary-button" prefetch={false} href={`${base}&view=all#inventory-stock-list`}>Stock In / Adjust</Link></div>
        <form action="/admin/inventory/action" method="post" className="inventory-form">
          <input type="hidden" name="action" value="stock_out"/><input type="hidden" name="store" value={store}/>
          <label className="span-2"><span>Usage / Check-out Batch</span><Suspense fallback={<select name="checkoutBatchId" required defaultValue="" aria-busy="true"><option value="">Loading check-out batch…</option></select>}>
            <BatchSelect supabase={supabase} />
          </Suspense></label>
          <Suspense fallback={<label className="span-2"><span>Item</span><select name="itemId" required defaultValue="" aria-busy="true"><option value="">Loading inventory…</option></select></label>}>
            <StockOutItems catalog={catalog} />
          </Suspense>
          <label><span>Quantity</span><input name="qty" type="number" min="0.01" step="0.01" required/></label>
          <label><span>Taken By</span><input name="takenBy" placeholder="Name of person collecting" maxLength={100} required/></label>
          <label className="span-2"><span>Purpose / Room / Location</span><input name="note" placeholder="e.g. General Staff — painting Block A room 103" maxLength={500} required/></label>
          <div className="span-2"><button className="button" type="submit">Record Stock Out</button></div>
        </form>
      </section>}

      <Suspense fallback={<p className="subtle" role="status">Loading material issues…</p>}>
        <IssueHistory supabase={supabase} store={store} />
      </Suspense>
      <Suspense fallback={<p className="subtle" role="status">Loading stock adjustments…</p>}>
        <AdjustmentHistory supabase={supabase} store={store} />
      </Suspense>
    </Fragment>
  </AppShell>;
}

function StockMetrics({ total, near, out }: { total: number | string; near: number | string; out: number | string }) {
  return <>
    <article><span>Total Items</span><strong>{total}</strong><small>Active inventory records</small></article>
    <article className="warning"><span>Near Reorder</span><strong>{near}</strong><small>Stock at or below reorder level</small></article>
    <article className="danger"><span>Out of Stock</span><strong>{out}</strong><small>Immediate attention required</small></article>
  </>;
}

async function StockCounts({ rows }: { rows: Reads["catalog"] }) {
  const { data, error } = await rows;
  if (error || !data) return <StockMetrics total="—" near="—" out="—" />;
  const verified = data.filter(item => item.is_active && !item.quantity_unverified);
  const out = verified.filter(item => Number(item.balance_qty) <= 0).length;
  const near = verified.filter(item => Number(item.balance_qty) > 0 && Number(item.balance_qty) <= Number(item.reorder_level)).length;
  return <StockMetrics total={data.length} near={near} out={out} />;
}

async function OrderCount({ catalog }: { catalog: Catalog }) {
  const { purchases, error } = await catalog;
  return error ? "—" : purchases.filter(row => row.needsOrder).length;
}

async function PurchaseList({ catalog, store, canManage, view }: { catalog: Catalog; store: InventoryStore; canManage: boolean; view?: string }) {
  const { purchases, error } = await catalog;
  if (error) return <p className="error">Purchase list could not be loaded: {error.message}</p>;
  return <ItemsToOrder rows={purchases} store={store} canManage={canManage} initialView={view} />;
}

async function NewItem({ catalog, store }: { catalog: Catalog; store: InventoryStore }) {
  const { codes, error } = await catalog;
  return <InventoryNewItem store={store} items={codes} unavailable={Boolean(error)} />;
}

async function ItemFinder({ catalog, store }: { catalog: Catalog; store: InventoryStore }) {
  const { activeCodes } = await catalog;
  return <InventoryItemFinder items={activeCodes} store={store} />;
}

async function StockOutItems({ catalog }: { catalog: Catalog }) {
  const { picker } = await catalog;
  return <StockOutItemPicker items={picker.filter(item => !item.quantity_unverified)} />;
}

async function BatchSelect({ supabase }: { supabase: InventoryClient }) {
  let checkoutBatch;
  try {
    checkoutBatch = await activeCheckoutBatch(supabase);
  } catch {
    return <><select name="checkoutBatchId" required defaultValue=""><option value="">Check-out batch unavailable</option></select>
      <span className="error">Unable to load the check-out batch. Please refresh.</span></>;
  }
  return <select name="checkoutBatchId" required defaultValue=""><option value="" disabled>Select the purpose of this stock-out</option>{checkoutBatch?.state === "active" && <option value={checkoutBatch.id}>Check-out rooms · {checkoutBatch.batch_no}</option>}<option value="other">Other work (outside the check-out batch)</option></select>;
}

async function StockResults({ stock, store, category, canManage }: {
  stock: NonNullable<Reads["stock"]>; store: InventoryStore; category: string; canManage: boolean;
}) {
  const { data, error } = await stock;
  if (error) return <p className="error">{error.message}</p>;
  const stockRows = data ?? [];
  const categoryOrder = [...new Set(["Building", "Electrical", "Chemical", "Piping", "Painting", ...stockRows.map((item) => item.category)])];
  const groupedRows = category
    ? [{ category, items: stockRows }]
    : categoryOrder.map((name) => ({ category: name, items: stockRows.filter((item) => item.category === name) })).filter((group) => group.items.length > 0);
  return stockRows.length === 0 ? <p className="dashboard-empty">No items match this search.</p> : <div className="table-wrap"><table className="table inventory-table"><thead><tr><th>Item</th><th>Category</th><th>Movement</th><th>Balance</th><th>Reorder</th><th>Qty to Order</th><th>Cost</th><th>Status</th><th>Action</th></tr></thead><tbody>{groupedRows.map((group: any) => <Fragment key={group.category}><tr className="inventory-group-row"><td colSpan={9}><strong>{group.category}</strong><span>{group.items.length} items · Item Code order</span></td></tr>{group.items.map((item: any) => { const balance=Number(item.balance_qty); const reorder=Number(item.reorder_level); const state=item.quantity_unverified?"Pending confirmation":stockState(balance,reorder); return <tr key={item.id}><td><strong>{item.item_code}</strong><small>{item.description}</small>{item.source_details&&<small>Pack: {item.source_details.original_quantity} · Source balance: {String(item.source_details.available_quantity ?? "Not recorded")} · Source minimum: {String(item.source_details.minimum_to_order ?? "Not recorded")}</small>}{item.quantity_unverified&&<small>Quantity / unit needs confirmation</small>}</td><td>{item.category}</td><td>{String(item.movement_category).replaceAll("_"," ")}</td><td><strong>{item.quantity_unverified?"Pending confirmation":balance}</strong></td><td>{reorder}</td><td>{qtyToOrder(balance,reorder)}</td><td>{item.cost==null?"—":`RM ${Number(item.cost).toFixed(2)}`}</td><td><span className={`stock-state ${state==="Out of Stock"?"out":state==="Near Reorder"?"near":"ok"}`}>{state}</span>{!item.is_active && <span className="stock-state inactive">Inactive</span>}</td><td>{canManage ? <details className="inventory-details"><summary>Edit / Adjust</summary><div className="inventory-edit-grid"><form action="/admin/inventory/action" method="post" className="inventory-form mini"><input type="hidden" name="action" value="edit"/><input type="hidden" name="store" value={store}/><input type="hidden" name="itemId" value={item.id}/><label className="span-2"><span>Description</span><input name="description" defaultValue={item.description} required/></label><label><span>Category</span><select name="category" defaultValue={item.category}><option value="Office Inventory">Office Inventory</option><option value="Cleaner Supplies">Cleaner Supplies</option><option value="Building">Building</option><option value="Electrical">Electrical</option><option value="Painting">Painting</option><option value="Piping">Piping</option></select></label><label><span>Movement</span><select name="movement" defaultValue={item.movement_category}><option value="fast">Fast Moving</option><option value="slow">Slow Moving</option><option value="once_in_a_while">Once in a while</option></select></label><label><span>Reorder Level</span><input name="reorder" type="number" min="0" step="0.01" defaultValue={item.reorder_level} required/></label><label><span>Unit</span><input name="unit" defaultValue={item.unit || ""}/></label><label><span>Cost (RM)</span><input name="cost" type="number" min="0" step="0.01" defaultValue={item.cost ?? ""}/></label><label><span><input name="isActive" type="checkbox" defaultChecked={item.is_active}/> Active Item</span></label><div className="span-2"><button className="button" type="submit">Save Details</button></div></form><form action="/admin/inventory/action" method="post" className="inventory-form mini"><input type="hidden" name="action" value="adjust"/><input type="hidden" name="store" value={store}/><input type="hidden" name="itemId" value={item.id}/><label><span>Adjustment</span><select name="adjustmentType"><option value="stock_in">Stock In</option><option value="correction_add">Correction Add</option><option value="correction_remove">Correction Remove</option></select></label><label><span>Quantity</span><input name="qty" type="number" min="0.01" step="0.01" required/></label><label className="span-2"><span>Reason / Note</span><input name="note" placeholder="Invoice, delivery or correction reason" required/></label><div className="span-2"><button className="button" type="submit">Update Stock</button></div></form></div></details> : "—"}</td></tr>; })}</Fragment>)}</tbody></table></div>;
}

async function IssueHistory({ supabase, store }: { supabase: InventoryClient; store: InventoryStore }) {
  const issues = await supabase.from("inventory_issue_history").select("id,qty,balance_before,balance_after,issued_at,item:inventory_items!inner(item_code,description,inventory_group),job:maintenance_jobs(job_no,room_no),checkout:checkout_rooms!checkout_room_id(reference_no,room_no,block:blocks!block_id(code)),staff:profiles!staff_id(full_name)").eq("item.inventory_group",store).order("issued_at", { ascending: false }).limit(30);
  return <section className="panel inventory-history-card"><div className="section-head compact-head"><div><h3>Material Issue / Usage History</h3><p className="subtle">Latest materials issued to maintenance jobs and check-out rooms.</p></div></div>{issues.error ? <p className="error">Unable to load material issues. Please refresh.</p> : (issues.data || []).length === 0 ? <p className="dashboard-empty">No material issues yet.</p> : <div className="table-wrap"><table className="table inventory-table"><thead><tr><th>Item</th><th>Job / Room</th><th>Staff</th><th>Qty Issued</th><th>Balance</th><th>Date</th></tr></thead><tbody>{(issues.data || []).map((row:any)=><tr key={row.id}><td><strong>{row.item?.item_code}</strong><small>{row.item?.description}</small></td><td>{row.checkout ? <><strong>{row.checkout.reference_no}</strong><small>Block {row.checkout.block?.code || "—"} · Room {row.checkout.room_no}</small></> : row.job ? <><strong>{row.job.job_no}</strong><small>Room {row.job.room_no}</small></> : <span className="subtle">No linked room</span>}</td><td>{row.staff?.full_name || "—"}</td><td>{row.qty}</td><td>{row.balance_before} → {row.balance_after}</td><td>{issueDate.format(new Date(row.issued_at))}</td></tr>)}</tbody></table></div>}</section>;
}

async function AdjustmentHistory({ supabase, store }: { supabase: InventoryClient; store: InventoryStore }) {
  const adjustments = await supabase.from("inventory_adjustment_history").select("id,adjustment_type,qty,balance_before,balance_after,note,adjusted_at,item:inventory_items!inner(item_code,description,inventory_group),user:profiles!adjusted_by(full_name)").eq("item.inventory_group",store).order("adjusted_at", { ascending: false }).limit(30);
  return <section className="panel inventory-history-card"><div className="section-head compact-head"><div><h3>Stock Adjustment History</h3><p className="subtle">Latest stock-in, stock-out and correction records.</p></div></div>{adjustments.error ? <p className="error">Unable to load stock adjustments. Please refresh.</p> : (adjustments.data || []).length === 0 ? <p className="dashboard-empty">No stock adjustments yet.</p> : <div className="table-wrap"><table className="table inventory-table"><thead><tr><th>Item</th><th>Adjustment</th><th>Qty</th><th>Balance</th><th>Recipient / Purpose</th><th>Recorded By</th><th>Date / Time</th></tr></thead><tbody>{(adjustments.data || []).map((row:any)=><tr key={row.id}><td><strong>{row.item?.item_code}</strong><small>{row.item?.description}</small></td><td>{row.adjustment_type === "correction_remove" && row.note?.startsWith("Stock Out | Taken by: ") ? "Stock Out" : String(row.adjustment_type).replaceAll("_"," ")}</td><td>{row.qty}</td><td>{row.balance_before} → {row.balance_after}</td><td>{row.note}</td><td>{row.user?.full_name || "—"}</td><td>{adjustmentTime.format(new Date(row.adjusted_at))}</td></tr>)}</tbody></table></div>}</section>;
}
