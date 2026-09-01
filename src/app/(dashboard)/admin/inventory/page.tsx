import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function stockState(balance: number, reorder: number) {
  if (balance <= 0) return "Out of Stock";
  if (balance <= reorder) return "Near Reorder";
  return "In Stock";
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const query = await searchParams;
  const supabase = await createClient();
  const { data: items, error } = await supabase.from("inventory_items").select("id,item_code,description,category,movement_category,balance_qty,reorder_level,cost,unit,is_active").order("movement_category").order("description");
  const rows = items || [];
  const out = rows.filter((x: any) => Number(x.balance_qty) <= 0).length;
  const near = rows.filter((x: any) => Number(x.balance_qty) > 0 && Number(x.balance_qty) <= Number(x.reorder_level)).length;
  return <AppShell profile={profile} title="Inventory">
    <div className="section-head"><div><p className="eyebrow">Phase 4</p><h2>Inventory</h2><p className="subtle">Stock balance, movement category and reorder monitoring.</p></div></div>
    {query.error && <p className="error">{query.error}</p>}{query.success && <p className="success">Inventory saved successfully.</p>}{error && <p className="error">{error.message}</p>}
    <div className="metric-grid"><article className="metric"><span>Total Items</span><strong>{rows.length}</strong></article><article className="metric"><span>Near Reorder</span><strong>{near}</strong></article><article className="metric"><span>Out of Stock</span><strong>{out}</strong></article></div>
    {profile.role === "admin" && <section className="panel"><h3>Add Inventory Item</h3><form action="/admin/inventory/action" method="post" className="form-grid"><input type="hidden" name="action" value="create"/><label><span>Item Code</span><input name="itemCode" required/></label><label className="field-wide"><span>Description</span><input name="description" required/></label><label><span>Category</span><select name="category" required><option value="Building">Building</option><option value="Electrical">Electrical</option><option value="Painting">Painting</option><option value="Piping">Piping</option></select></label><label><span>Movement</span><select name="movement"><option value="fast">Fast Moving</option><option value="slow">Slow Moving</option><option value="once_in_a_while">Once in a while</option></select></label><label><span>Balance QTY</span><input name="balance" type="number" min="0" step="0.01" defaultValue="0" required/></label><label><span>Reorder Level</span><input name="reorder" type="number" min="0" step="0.01" defaultValue="0" required/></label><label><span>Unit</span><input name="unit" placeholder="pcs / box / tube"/></label><label><span>Cost (RM)</span><input name="cost" type="number" min="0" step="0.01"/></label><div className="field-wide actions"><button className="button" type="submit">Add Item</button></div></form></section>}
    <section className="panel list-panel">{rows.length === 0 ? <p className="subtle">No inventory items yet.</p> : rows.map((item: any) => { const state = stockState(Number(item.balance_qty), Number(item.reorder_level)); return <article className="list-row" key={item.id}><div><div className="actions"><strong>{item.item_code} · {item.description}</strong><span className="badge">{state}</span></div><p>{item.category} · {String(item.movement_category).replaceAll("_", " ")} · Balance {item.balance_qty} {item.unit || ""} · Reorder {item.reorder_level}</p><small>{item.cost == null ? "Cost not entered" : `RM ${Number(item.cost).toFixed(2)}`}</small></div></article>; })}</section>
  </AppShell>;
}
