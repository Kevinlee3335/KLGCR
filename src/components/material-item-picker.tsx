"use client";

import { useMemo, useState } from "react";

type MaterialItem = { id: string; item_code: string; description: string; balance_qty: number | string; unit: string | null };

export function MaterialItemPicker({ items, name, required }: { items: MaterialItem[]; name: string; required?: boolean }) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? items.filter((item) => `${item.item_code} ${item.description}`.toLowerCase().includes(term)) : items;
  }, [items, query]);

  return <>
    <input
      type="search"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      placeholder="Search item name or code (e.g. window, P00003)"
      aria-label="Search inventory item"
    />
    <select name={name} required={required} defaultValue="">
      <option value="">Select material</option>
      {matches.map((item) => <option key={item.id} value={item.id}>{item.item_code} · {item.description} · Balance {item.balance_qty} {item.unit || ""}</option>)}
    </select>
    {query.trim() && matches.length === 0 && <small className="subtle">No active inventory item matches this search.</small>}
  </>;
}
