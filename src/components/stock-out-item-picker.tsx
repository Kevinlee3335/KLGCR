"use client";

import { useId, useState } from "react";

type StockItem = { id: string; item_code: string; description: string; balance_qty: number | string; unit: string | null };

export function StockOutItemPicker({ items }: { items: StockItem[] }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = items.filter((item) => words.every((word) => `${item.item_code} ${item.description}`.toLowerCase().includes(word)));

  return <div className="span-2">
    <label htmlFor={`${id}-search`}><span>Search Item Code or Name</span></label>
    <input id={`${id}-search`} type="search" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(""); }} placeholder="Type: paint, waterproof, PG00072…" autoComplete="off"/>
    <label htmlFor={`${id}-item`}><span>Item</span></label>
    <select id={`${id}-item`} name="itemId" value={selected} onChange={(event) => setSelected(event.target.value)} required>
      <option value="" disabled>{matches.length ? "Select item" : "No matching items"}</option>
      {matches.map((item) => <option key={item.id} value={item.id}>{item.item_code} · {item.description} · Available: {item.balance_qty} {item.unit || ""}</option>)}
    </select>
    <p className="subtle" role="status">{matches.length} matching {matches.length === 1 ? "item" : "items"}{!matches.length && ". Try another name or item code."}</p>
  </div>;
}
