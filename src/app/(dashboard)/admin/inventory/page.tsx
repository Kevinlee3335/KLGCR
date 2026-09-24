/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppShell } from "@/components/app-shell";
import { ItemsToOrder } from "@/components/items-to-order";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Fragment } from "react";

function stockState(balance: number, reorder: number) {
  if (balance <= 0) return "Out of Stock";
  if (balance <= reorder) return "Near Reorder";
  return "In Stock";
}

function qtyToOrder(balance: number, reorder: number) {
  return Math.max(0, reorder - balance);
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; q?: string; category?: string }> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const query = await searchParams;
  const supabase = await createClient();
  const search = (query.q || "").trim();
  const category = ["Building", "Electrical", "Chemical", "Piping", "Painting"].includes(query.category || "") ? query.category! : "";
  let inventoryQuery = supabase.from("inventory_items").select("id,item_code,description,category,movement_category,balance_qty,reorder_level,cost,unit,is_active").order("item_code");
  if (search) inventoryQuery = inventoryQuery.or(`item_code.ilike.%${search}%,description.ilike.%${search}%`);
  if (category) inventoryQuery = inventoryQuery.eq("category", category);
  const [{ data: items, error }, { data: issues }, { data: adjustments }, { data: catalog }] = await Promise.all([
    inventoryQuery,
    supabase.from("inventory_issue_history").select("id,qty,balance_before,balance_after,issued_at,item:inventory_items(item_code,description),job:maintenance_jobs(job_no,room_no),staff:profiles!staff_id(full_name)").order("issued_at", { ascending: false }).limit(30),
    supabase.from("inventory_adjustment_history").select("id,adjustment_type,qty,balance_before,balance_after,note,adjusted_at,item:inventory_items(item_code,description),user:profiles!adjusted_by(full_name)").order("adjusted_at", { ascending: false }).limit(30),
    supabase.from("inventory_items").select("item_code,description,category").eq("is_active", true).order("item_code"),
  ]);
  const rows = items || [];
  const itemOptions = catalog || [];
  const categoryOrder = ["Building", "Electrical", "Chemical", "Piping", "Painting"];
  const hasStockFilter = Boolean(search || category);
  const stockRows = hasStockFilter ? rows : [];
  const groupedRows = category
    ? [{ category, items: stockRows }]
    : categoryOrder.map((name) => ({ category: name, items: stockRows.filter((item: any) => item.category === name) })).filter((group) => group.items.length > 0);
  const orderRows = rows.filter((x: any) => Number(x.balance_qty) <= Number(x.reorder_level) && x.is_active);
  const out = rows.filter((x: any) => Number(x.balance_qty) <= 0 && x.is_active).length;
  const near = rows.filter((x: any) => Number(x.balance_qty) > 0 && Number(x.balance_qty) <= Number(x.reorder_level) && x.is_active).length;

  return <AppShell profile={profile} title="Inventory">
    <div className="section-head inventory-heading"><div><p className="eyebrow">Inventory Control</p><h2>Inventory</h2><p className="subtle">Monitor stock levels, reorder requirements and material movement.</p></div></div>
    {query.error && <p className="error">{query.error}</p>}{query.success && <p className="success">Inventory saved successfully.</p>}{error && <p className="error">{error.message}</p>}

    <section className="inventory-kpis">
      <article><span>Total Items</span><strong>{rows.length}</strong><small>Active inventory records</small></article>
      <article className="warning"><span>Near Reorder</span><strong>{near}</strong><small>Stock at or below reorder level</small></article>
      <article className="danger"><span>Out of Stock</span><strong>{out}</strong><small>Immediate attention required</small></article>
      <article className="gold"><span>Need to Order</span><strong>{orderRows.length}</strong><small>Items recommended for purchase</small></article>
    </section>

    <section className="panel inventory-order-panel">
      <div className="section-head compact-head"><div><h3>Items to Order</h3><p className="subtle">Current items that have reached their reorder point.</p></div></div>
      <ItemsToOrder rows={orderRows}/>
    </section>

    {profile.role === "admin" && <section className="panel inventory-form-card"><div className="section-head compact-head"><div><h3>Add Inventory Item</h3><p className="subtle">Create a new stock item and define its reorder point.</p></div></div><form action="/admin/inventory/action" method="post" className="inventory-form"><input type="hidden" name="action" value="create"/><label><span>Item Code</span><input name="itemCode" required/></label><label className="span-2"><span>Description</span><input name="description" required/></label><label><span>Category</span><select name="category" required><option value="Building">Building</option><option value="Electrical">Electrical</option><option value="Painting">Painting</option><option value="Piping">Piping</option></select></label><label><span>Movement</span><select name="movement"><option value="fast">Fast Moving</option><option value="slow">Slow Moving</option><option value="once_in_a_while">Once in a while</option></select></label><label><span>Opening Balance</span><input name="balance" type="number" min="0" step="0.01" defaultValue="0" required/></label><label><span>Reorder Level</span><input name="reorder" type="number" min="0" step="0.01" defaultValue="0" required/></label><label><span>Unit</span><input name="unit" placeholder="pcs / box / tube"/></label><label><span>Cost (RM)</span><input name="cost" type="number" min="0" step="0.01"/></label><div className="span-2"><button className="button" type="submit">Add Inventory Item</button></div></form></section>}

    <section className="panel inventory-stock-card"><div className="section-head compact-head"><div><h3>Stock List</h3><p className="subtle">Grouped by store category and ordered by Item Code.</p></div></div><form method="get" className="inventory-form inventory-search"><label className="span-2"><span>Search Item Code or Description</span><input name="q" list="inventory-item-options" defaultValue={search} placeholder="Type: window, lock, B00022…" autoComplete="off"/><datalist id="inventory-item-options">{itemOptions.map((item: any) => <option key={item.item_code} value={item.description} label={`${item.item_code} · ${item.category}`}/>)}</datalist></label><label><span>Inventory Group</span><select name="category" defaultValue={category}><option value="">All groups</option><option value="Building">Building</option><option value="Electrical">Electrical</option><option value="Chemical">Chemical</option><option value="Piping">Piping</option><option value="Painting">Painting</option></select></label><div><button className="button" type="submit">Search</button>{(search || category) && <a className="button secondary-button" href="/admin/inventory">Clear</a>}</div></form>{!hasStockFilter ? <p className="dashboard-empty">Select an inventory group or search by Item Code / name to view stock.</p> : stockRows.length === 0 ? <p className="dashboard-empty">No items match this search.</p> : <div className="table-wrap"><table className="table inventory-table"><thead><tr><th>Item</th><th>Category</th><th>Movement</th><th>Balance</th><th>Reorder</th><th>Qty to Order</th><th>Cost</th><th>Status</th><th>Action</th></tr></thead><tbody>{groupedRows.map((group: any) => <Fragment key={group.category}><tr className="inventory-group-row"><td colSpan={9}><strong>{group.category}</strong><span>{group.items.length} items · Item Code order</span></td></tr>{group.items.map((item: any) => { const balance=Number(item.balance_qty); const reorder=Number(item.reorder_level); const state=stockState(balance,reorder); return <tr key={item.id}><td><strong>{item.item_code}</strong><small>{item.description}</small></td><td>{item.category}</td><td>{String(item.movement_category).replaceAll("_"," ")}</td><td><strong>{balance}</strong> {item.unit || ""}</td><td>{reorder} {item.unit || ""}</td><td>{qtyToOrder(balance,reorder)} {item.unit || ""}</td><td>{item.cost==null?"—":`RM ${Number(item.cost).toFixed(2)}`}</td><td><span className={`stock-state ${state==="Out of Stock"?"out":state==="Near Reorder"?"near":"ok"}`}>{state}</span>{!item.is_active && <span className="stock-state inactive">Inactive</span>}</td><td>{profile.role === "admin" ? <details className="inventory-details"><summary>Edit / Adjust</summary><div className="inventory-edit-grid"><form action="/admin/inventory/action" method="post" className="inventory-form mini"><input type="hidden" name="action" value="edit"/><input type="hidden" name="itemId" value={item.id}/><label className="span-2"><span>Description</span><input name="description" defaultValue={item.description} required/></label><label><span>Category</span><select name="category" defaultValue={item.category}><option value="Building">Building</option><option value="Electrical">Electrical</option><option value="Painting">Painting</option><option value="Piping">Piping</option></select></label><label><span>Movement</span><select name="movement" defaultValue={item.movement_category}><option value="fast">Fast Moving</option><option value="slow">Slow Moving</option><option value="once_in_a_while">Once in a while</option></select></label><label><span>Reorder Level</span><input name="reorder" type="number" min="0" step="0.01" defaultValue={item.reorder_level} required/></label><label><span>Unit</span><input name="unit" defaultValue={item.unit || ""}/></label><label><span>Cost (RM)</span><input name="cost" type="number" min="0" step="0.01" defaultValue={item.cost ?? ""}/></label><label><span><input name="isActive" type="checkbox" defaultChecked={item.is_active}/> Active Item</span></label><div className="span-2"><button className="button" type="submit">Save Details</button></div></form><form action="/admin/inventory/action" method="post" className="inventory-form mini"><input type="hidden" name="action" value="adjust"/><input type="hidden" name="itemId" value={item.id}/><label><span>Adjustment</span><select name="adjustmentType"><option value="stock_in">Stock In</option><option value="correction_add">Correction Add</option><option value="correction_remove">Correction Remove</option></select></label><label><span>Quantity</span><input name="qty" type="number" min="0.01" step="0.01" required/></label><label className="span-2"><span>Reason / Note</span><input name="note" placeholder="Invoice, delivery or correction reason" required/></label><div className="span-2"><button className="button" type="submit">Update Stock</button></div></form></div></details> : "—"}</td></tr>; })}</Fragment>)}</tbody></table></div>}</section>

    <section className="panel inventory-history-card"><div className="section-head compact-head"><div><h3>Material Issue / Usage History</h3><p className="subtle">Latest materials issued to maintenance jobs.</p></div></div>{(issues || []).length === 0 ? <p className="dashboard-empty">No material issues yet.</p> : <div className="table-wrap"><table className="table inventory-table"><thead><tr><th>Item</th><th>Job / Room</th><th>Staff</th><th>Qty Issued</th><th>Balance</th><th>Date</th></tr></thead><tbody>{(issues || []).map((row:any)=><tr key={row.id}><td><strong>{row.item?.item_code}</strong><small>{row.item?.description}</small></td><td>{row.job?.job_no}<small>{row.job?.room_no}</small></td><td>{row.staff?.full_name || "—"}</td><td>{row.qty}</td><td>{row.balance_before} → {row.balance_after}</td><td>{new Intl.DateTimeFormat("en-MY",{timeZone:"Asia/Kuala_Lumpur",day:"2-digit",month:"short",year:"numeric"}).format(new Date(row.issued_at))}</td></tr>)}</tbody></table></div>}</section>

    <section className="panel inventory-history-card"><div className="section-head compact-head"><div><h3>Stock Adjustment History</h3><p className="subtle">Latest stock-in and correction records.</p></div></div>{(adjustments || []).length === 0 ? <p className="dashboard-empty">No stock adjustments yet.</p> : <div className="table-wrap"><table className="table inventory-table"><thead><tr><th>Item</th><th>Adjustment</th><th>Qty</th><th>Balance</th><th>Note</th><th>By</th></tr></thead><tbody>{(adjustments || []).map((row:any)=><tr key={row.id}><td><strong>{row.item?.item_code}</strong><small>{row.item?.description}</small></td><td>{String(row.adjustment_type).replaceAll("_"," ")}</td><td>{row.qty}</td><td>{row.balance_before} → {row.balance_after}</td><td>{row.note}</td><td>{row.user?.full_name || "—"}</td></tr>)}</tbody></table></div>}</section>
  </AppShell>;
}
