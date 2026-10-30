"use client";

import { useState } from "react";
import type { ProcurementRow } from "@/lib/inventory-procurement";

export function ItemsToOrder({ rows, store, canManage, initialView = "order" }: {
  rows: ProcurementRow[]; store: string; canManage: boolean; initialView?: string;
}) {
  const [view, setView] = useState(initialView === "hidden" ? "hidden" : "order");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const matching = rows.filter((row) => (view === "hidden" ? row.buyWhenNeeded : row.needsOrder)
    && `${row.item_code} ${row.description} ${row.brands.join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()));
  const visible = expanded ? matching : matching.slice(0, 5);
  const chosen = matching.filter((row) => selected.has(row.id));
  const allSelected = matching.length > 0 && chosen.length === matching.length;
  function changeView(next: string) { setView(next); setSelected(new Set()); setExpanded(false); }

  return <div className="procurement-controls">
    <div className="procurement-toolbar" role="group" aria-label="Purchase list view">
      <button type="button" className={`button ${view === "order" ? "" : "secondary-button"}`} aria-pressed={view === "order"} onClick={() => changeView("order")}>Items to Order ({rows.filter((row) => row.needsOrder).length})</button>
      <button type="button" className={`button ${view === "hidden" ? "" : "secondary-button"}`} aria-pressed={view === "hidden"} onClick={() => changeView("hidden")}>Buy When Needed ({rows.filter((row) => row.buyWhenNeeded).length})</button>
    </div>
    <label className="procurement-search"><span>Search Item Code, Material or Brand</span><input type="search" value={search} placeholder="Search cement, paint, E00018…" onChange={(event) => { setSearch(event.target.value); setSelected(new Set()); setExpanded(false); }}/></label>
    <form action="/admin/inventory/action" method="post" onSubmit={() => setSaving(true)}>
      <input type="hidden" name="action" value="procurement_mode"/>
      <input type="hidden" name="store" value={store}/>
      <input type="hidden" name="mode" value={view === "hidden" ? "maintain_stock" : "buy_when_needed"}/>
      {chosen.flatMap((row) => row.itemIds).map((id) => <input key={id} type="hidden" name="itemIds" value={id}/>)}
      {canManage && <div className="procurement-toolbar">
        <label className="procurement-check"><input type="checkbox" checked={allSelected} disabled={!matching.length || saving} onChange={() => setSelected(allSelected ? new Set() : new Set(matching.map((row) => row.id)))}/> Select All ({matching.length})</label>
        <span className="subtle" aria-live="polite">{chosen.length} selected</span>
        <button className="button" type="submit" disabled={!chosen.length || saving}>{saving ? "Saving…" : view === "hidden" ? "Restore Stock Alert" : "Buy When Needed"}</button>
      </div>}
      <p className="subtle">{view === "hidden" ? "Hidden from purchase reminders, including when stock is zero. Restore alerts whenever needed." : "Select materials to buy only when needed. Group totals include all approved brands."}</p>
      {matching.length === 0 ? <p className="dashboard-empty">{search ? "No matching materials." : view === "hidden" ? "No materials marked Buy When Needed." : "No items currently require ordering."}</p> : <div className="table-wrap"><table className="table inventory-table">
        <thead><tr>{canManage && <th>Select</th>}<th>Material / Item Code</th><th>Balance</th><th>Minimum Stock</th><th>Qty to Order</th><th>Status</th></tr></thead>
        <tbody>{visible.map((item) => <tr key={item.id}>
          {canManage && <td><input type="checkbox" aria-label={`Select ${item.description}`} checked={selected.has(item.id)} disabled={saving} onChange={() => setSelected((previous) => { const next = new Set(previous); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}/></td>}
          <td><strong>{item.description}</strong><small>{item.item_code}</small>{item.brands.length > 0 && <details><summary>{item.brands.length} brands · View stock breakdown</summary>{item.brands.map((brand) => <small key={brand}>{brand}</small>)}</details>}</td>
          <td>{item.unverified ? "Pending confirmation" : `${item.balance_qty} ${item.unit || ""}`}</td><td>{item.reorder_level} {item.unit || ""}</td>
          <td><strong>{view === "hidden" || item.unverified ? "—" : `${Math.max(0, item.reorder_level - item.balance_qty)} ${item.unit || ""}`}</strong></td>
          <td><span className={`stock-state ${view === "hidden" ? "ok" : item.balance_qty <= 0 ? "out" : "near"}`}>{view === "hidden" ? "Buy When Needed" : item.balance_qty <= 0 ? "Out of Stock" : "Near Reorder"}</span></td>
        </tr>)}</tbody>
      </table></div>}
    </form>
    {matching.length > 5 && <button type="button" className="button secondary-button" style={{ marginTop: 16 }} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Show first 5 items" : `Show all ${matching.length} items`}</button>}
  </div>;
}
