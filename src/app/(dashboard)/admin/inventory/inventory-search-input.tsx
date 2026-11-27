"use client";

import { Suspense, use, useId, useState } from "react";
import type { InventoryCodeItem } from "@/lib/inventory-new-item";

type Suggestions = Promise<InventoryCodeItem[]>;

function ItemOptions({ suggestions }: { suggestions: Suggestions }) {
  const items = use(suggestions);
  return items.map(item =>
    <option key={item.item_code} value={item.description} label={`${item.item_code} · ${item.category}`} />
  );
}

export function InventorySearchInput({ search, suggestions }: { search: string; suggestions: Suggestions }) {
  const id = useId();
  const [opened, setOpened] = useState(false);
  const showSuggestions = () => setOpened(true);
  return <>
    <input name="q" list={id} defaultValue={search} placeholder="Type: window, lock, B00022…" autoComplete="off"
      onPointerDown={showSuggestions} onFocus={showSuggestions} onChange={showSuggestions} />
    <datalist id={id}>{opened && <Suspense fallback={null}><ItemOptions suggestions={suggestions} /></Suspense>}</datalist>
  </>;
}
