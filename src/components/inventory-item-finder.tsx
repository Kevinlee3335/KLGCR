"use client";

import Link from "next/link";
import { useState } from "react";

type ItemOption = { item_code: string; description: string; category: string };

export function InventoryItemFinder({ items }: { items: ItemOption[] }) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLocaleLowerCase();
  const matches = term ? items.filter((item) =>
    item.item_code.toLocaleLowerCase().includes(term) || item.description.toLocaleLowerCase().includes(term)
  ).slice(0, 8) : [];

  return <div className="inventory-item-finder">
    <label htmlFor="existing-inventory-item">Find existing item by code or name</label>
    <input id="existing-inventory-item" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
      placeholder="Type item code or name…" autoComplete="off"/>
    {term && <div className="inventory-item-finder-results" aria-label="Matching inventory items">
      {matches.length ? matches.map((item) => <Link key={item.item_code}
        href={`/admin/inventory?q=${encodeURIComponent(item.item_code)}#inventory-stock-list`}>
        <strong>{item.item_code}</strong><span>{item.description}</span>
      </Link>) : <p>No matching item. Add a new one below.</p>}
    </div>}
  </div>;
}
