"use client";

import { useEffect, useState } from "react";
import { readPODraft, writePODraft } from "@/lib/po-draft";
import { Search } from "lucide-react";
import type { ProcurementRow } from "@/lib/inventory-procurement";

export function ItemsToOrder({ rows, store, canManage, initialView = "order" }: {
  rows: ProcurementRow[]; store: string; canManage: boolean; initialView?: string;
}) {
  const [view, setView] = useState(initialView === "hidden" ? "hidden" : "order");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [poItems, setPoItems] = useState<Record<string, string>>({});
  const [poError, setPoError] = useState("");
  const [modes, setModes] = useState<Record<string, boolean>>({});
  const [cart, setCart] = useState<Record<string, {itemId:string;quantity:number}>>({});
  useEffect(()=>{setCart(Object.fromEntries(readPODraft(store).map(line=>[line.itemId,line])));},[store]);
  const [notice, setNotice] = useState("");
  const currentRows = rows.map(row => modes[row.id] === undefined ? row : {...row, buyWhenNeeded:modes[row.id], needsOrder:!modes[row.id] && !row.unverified && (row.balance_qty <= 0 || (row.itemIds.length > 1 ? row.balance_qty < row.reorder_level : row.balance_qty <= row.reorder_level))});
  async function saveMode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(saving)return;
    const data=new FormData(event.currentTarget); const ids=new Set(data.getAll("itemIds").map(String));
    setSaving(true);setPoError("");setNotice("");
    try {
      const response=await fetch("/admin/inventory/action",{method:"POST",body:data});
      const result=new URL(response.url,window.location.origin);
      if(!response.ok || !result.searchParams.has("success"))throw Error(result.searchParams.get("error") || "Unable to save. Please retry.");
      const hidden=data.get("mode")==="buy_when_needed";
      setModes(previous=>({...previous,...Object.fromEntries(rows.filter(row=>row.itemIds.some(id=>ids.has(id))).map(row=>[row.id,hidden]))}));
      setSelected(previous=>new Set([...previous].filter(id=>!rows.some(row=>row.id===id&&row.itemIds.some(itemId=>ids.has(itemId))))));
      setNotice(hidden?"Saved as Buy When Needed.":"Stock alert restored.");
    }catch(error){setPoError(error instanceof Error?error.message:"Unable to save. Please retry.");}finally{setSaving(false);}
  }
  const quantity = (row: ProcurementRow) => quantities[row.id] ?? String(Math.max(1, row.reorder_level - row.balance_qty));
  function addToPO(materials: ProcurementRow[]) {
    if (materials.some(row => !Number.isFinite(Number(quantity(row))) || Number(quantity(row)) < 0.01 || Number(quantity(row)) > 1000000)) { setPoError("Enter a quantity between 0.01 and 1,000,000."); return; }
    const next={...cart};
    materials.forEach(row=>{const itemId=poItems[row.id] || row.itemIds[0];next[itemId]={itemId,quantity:Number(quantity(row))};});
    if(Object.keys(next).length>100){setPoError("A PO supports up to 100 items.");return;}
    try{writePODraft(store,Object.values(next));}catch{setPoError("Unable to save PO list in this browser. Please allow browser storage and retry.");return;}
    setCart(next);setPoError("");setNotice("Added to PO list. Continue choosing materials, then open PO.");
  }
  const [saving, setSaving] = useState(false);
  const matching = currentRows.filter((row) => (view === "hidden" ? row.buyWhenNeeded : row.needsOrder)
    && `${row.item_code} ${row.description} ${row.brands.join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()));
  const visible = expanded ? matching : matching.slice(0, 5);
  const chosen = matching.filter((row) => selected.has(row.id));
  const allSelected = matching.length > 0 && chosen.length === matching.length;
  function changeView(next: string) { setView(next); setSelected(new Set()); setExpanded(false); }

  return <div className="procurement-controls">
    <div className="procurement-toolbar" role="group" aria-label="Purchase list view">
      <button type="button" className={`button ${view === "order" ? "" : "secondary-button"}`} aria-pressed={view === "order"} onClick={() => changeView("order")}>Items to Order ({currentRows.filter((row) => row.needsOrder).length})</button>
      <button type="button" className={`button ${view === "hidden" ? "" : "secondary-button"}`} aria-pressed={view === "hidden"} onClick={() => changeView("hidden")}>Buy When Needed ({currentRows.filter((row) => row.buyWhenNeeded).length})</button>
    </div>
    <label className="procurement-search"><span>Search inventory</span><span className="procurement-search-field"><Search size={19} aria-hidden="true"/><input type="search" value={search} placeholder="Search cement, paint, E00018…" onChange={(event) => { setSearch(event.target.value); setSelected(new Set()); setExpanded(false); }}/></span></label>
    <form action="/admin/inventory/action" method="post" onSubmit={saveMode}>
      <input type="hidden" name="action" value="procurement_mode"/>
      <input type="hidden" name="store" value={store}/>
      <input type="hidden" name="mode" value={view === "hidden" ? "maintain_stock" : "buy_when_needed"}/>
      {chosen.flatMap((row) => row.itemIds).map((id) => <input key={id} type="hidden" name="itemIds" value={id}/>)}
      {canManage && <div className="procurement-toolbar">
        <label className="procurement-check"><input type="checkbox" checked={allSelected} disabled={!matching.length || saving} onChange={() => setSelected(allSelected ? new Set() : new Set(matching.map((row) => row.id)))}/> Select All ({matching.length})</label>
        <button className="button secondary-button" type="button" disabled={!chosen.length || saving} onClick={() => addToPO(chosen)}>Add Selected to PO</button>
        <span className="subtle" aria-live="polite">{chosen.length} selected</span>
        <button className="button" type="submit" disabled={!chosen.length || saving}>{saving ? "Saving…" : view === "hidden" ? "Restore Stock Alert" : "Buy When Needed"}</button>
      </div>}
      {notice && <div className="procurement-feedback" role="status">{notice}{Object.keys(cart).length > 0 && <a className="button" href="/admin/inventory/purchase-orders">Open PO ({Object.keys(cart).length})</a>}</div>}
      {Object.keys(cart).length > 0 && <div className="procurement-toolbar procurement-cart"><strong>{Object.keys(cart).length} items in PO list</strong><a className="button" href={`/admin/inventory/purchase-orders?${new URLSearchParams({draft:JSON.stringify(Object.values(cart))})}`}>Open PO ({Object.keys(cart).length})</a><button type="button" className="button secondary-button" onClick={()=>{try{writePODraft(store,[]);setCart({});setNotice("PO list cleared.");}catch{setPoError("Unable to clear PO list.");}}}>Clear PO List</button></div>}
      {poError && <p role="alert">{poError}</p>}
      <p className="subtle">{view === "hidden" ? "Hidden from purchase reminders, including when stock is zero. Restore alerts whenever needed." : "Select materials to buy only when needed. Group totals include all approved brands."}</p>
      {matching.length === 0 ? <p className="dashboard-empty">{search ? "No matching materials." : view === "hidden" ? "No materials marked Buy When Needed." : "No items currently require ordering."}</p> : <div className="table-wrap"><table className={`table inventory-table ${canManage ? "procurement-managed" : ""}`}>
        <thead><tr>{canManage && <th>Select</th>}<th>Material / Item Code</th><th>Balance</th><th>Minimum Stock</th><th>Qty to Order</th><th>Status</th>{canManage && <><th>PO Quantity</th><th>Purchase Order</th></>}</tr></thead>
        <tbody>{visible.map((item) => <tr key={item.id}>
          {canManage && <td><input type="checkbox" aria-label={`Select ${item.description}`} checked={selected.has(item.id)} disabled={saving} onChange={() => setSelected((previous) => { const next = new Set(previous); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}/></td>}
          <td><strong>{item.description}</strong><small>{item.item_code}</small>{item.brands.length > 0 && <details><summary>{item.brands.length} brands · View stock breakdown</summary>{item.brands.map((brand) => <small key={brand}>{brand}</small>)}</details>}</td>
          <td>{item.unverified ? "Pending confirmation" : `${item.balance_qty} ${item.unit || ""}`}</td><td>{item.reorder_level} {item.unit || ""}</td>
          <td><strong>{view === "hidden" || item.unverified ? "—" : `${Math.max(0, item.reorder_level - item.balance_qty)} ${item.unit || ""}`}</strong></td>
          <td><span className={`stock-state ${view === "hidden" ? "ok" : item.balance_qty <= 0 ? "out" : "near"}`}>{view === "hidden" ? "Buy When Needed" : item.balance_qty <= 0 ? "Out of Stock" : "Near Reorder"}</span></td>
          {canManage && <><td><input aria-label={`PO quantity for ${item.description}`} type="number" min="0.01" max="1000000" step="0.01" value={quantity(item)} onChange={event => setQuantities(previous => ({...previous, [item.id]: event.target.value}))} style={{width:100}}/></td><td>{item.itemIds.length > 1 && <select aria-label={`PO brand for ${item.description}`} value={poItems[item.id] || item.itemIds[0]} onChange={event=>setPoItems(previous=>({...previous,[item.id]:event.target.value}))}>{item.itemIds.map((id,index)=><option key={id} value={id}>{item.brands[index]?.split(" · ").slice(0,2).join(" · ") || id}</option>)}</select>}<button type="button" className="button secondary-button" disabled={saving} onClick={() => addToPO([item])}>Add to PO</button> <button type="submit" form={`procurement-item-${item.id}`} className="button secondary-button" disabled={saving}>{view === "hidden" ? "Restore Stock Alert" : "Buy When Needed"}</button></td></>}
        </tr>)}</tbody>
      </table></div>}
    </form>
    {canManage && visible.map(item => <form key={item.id} id={`procurement-item-${item.id}`} action="/admin/inventory/action" method="post" onSubmit={saveMode}>
      <input type="hidden" name="action" value="procurement_mode"/>
      <input type="hidden" name="store" value={store}/>
      <input type="hidden" name="mode" value={view === "hidden" ? "maintain_stock" : "buy_when_needed"}/>
      {item.itemIds.map(id => <input key={id} type="hidden" name="itemIds" value={id}/>)}
    </form>)}
    {matching.length > 5 && <button type="button" className="button secondary-button" style={{ marginTop: 16 }} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Show first 5 items" : `Show all ${matching.length} items`}</button>}
  </div>;
}
