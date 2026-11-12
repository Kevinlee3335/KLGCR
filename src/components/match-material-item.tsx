"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./match-material-item.module.css";

type InventoryMatch = {
  id: string;
  item_code: string;
  description: string;
  inventory_group: string;
  balance_qty: number | string | null;
  unit: string | null;
  quantity_unverified: boolean;
};

type SearchResult = { term: string; items: InventoryMatch[] } | { term: string; error: true };
type MaterialLine = { requestId: string; itemId: string; materialName: string };

const stores: Record<string, string> = {
  building: "Building Material",
  office: "Office Inventory",
  cleaner: "Cleaner Supplies",
};

export function MatchMaterialItem(line: MaterialLine) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  return <div className={styles.picker}>
    <button ref={trigger} className="button secondary" type="button" aria-expanded={open}
      aria-controls={open ? panelId : undefined} aria-label={`Match Item · ${line.materialName}`}
      onClick={() => setOpen((value) => !value)}>Match Item</button>
    {open && <MatchMaterialForm {...line} panelId={panelId} onClose={() => {
      setOpen(false);
      trigger.current?.focus();
    }}/>}
  </div>;
}

function MatchMaterialForm({ requestId, itemId, materialName, panelId, onClose }: MaterialLine & { panelId: string; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [result, setResult] = useState<SearchResult>();
  const [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const term = query.trim();
  const searchable = term.length >= 2;
  const current = result?.term === term ? result : undefined;
  const items = current && "items" in current ? current.items : [];
  const selected = items.some((item) => item.id === selectedId);

  useEffect(() => { input.current?.focus(); }, []);

  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    async function search() {
      try {
        const response = await fetch(`/api/material-requests/inventory?${new URLSearchParams({ q: term })}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Unable to search inventory.");
        const data: { items: InventoryMatch[] } = await response.json();
        if (!Array.isArray(data.items)) throw new Error("Invalid inventory results.");
        if (!controller.signal.aborted) setResult({ term, items: data.items });
      } catch {
        if (!controller.signal.aborted) setResult({ term, error: true });
      }
    }
    const timer = window.setTimeout(() => void search(), 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [attempt, searchable, term]);

  return <form id={panelId} className={styles.form} aria-label={`Match ${materialName} to inventory`}
    action="/admin/material-requests/action" method="post" onSubmit={(event) => {
      if (!selected) event.preventDefault();
    }}>
    <input type="hidden" name="action" value="match_other"/>
    <input type="hidden" name="requestId" value={requestId}/>
    <input type="hidden" name="requestItemId" value={itemId}/>
    <label htmlFor={inputId}>Inventory item code or name</label>
    <input ref={input} id={inputId} type="search" value={query} maxLength={100} autoComplete="off"
      onChange={(event) => {
        const value = event.target.value;
        if (value.trim() !== term) {
          setSelectedId("");
          setResult(undefined);
        }
        setQuery(value);
      }}/>
    {term.length === 1 && <small role="status">Enter at least 2 characters.</small>}
    {searchable && !current && <small role="status">Searching inventory…</small>}
    {current && "error" in current && <div className={styles.actions}>
      <small role="alert">Unable to search inventory.</small>
      <button type="button" className="button secondary" onClick={() => {
        setResult(undefined);
        setAttempt((value) => value + 1);
      }}>Retry search</button>
    </div>}
    {current && "items" in current && (items.length ? <fieldset className={styles.results}>
      <legend className="sr-only">Select an inventory item</legend>
      {items.map((item) => <label key={item.id} className={styles.option}>
        <input type="radio" name="inventoryItemId" value={item.id} checked={selectedId === item.id}
          onChange={() => setSelectedId(item.id)}/>
        <span>
          <strong>{item.item_code}</strong> · {item.description}
          <small>{stores[item.inventory_group] ?? item.inventory_group} · {item.quantity_unverified
            ? "Quantity pending confirmation"
            : `Balance ${item.balance_qty ?? "—"}${item.unit ? ` ${item.unit}` : ""}`}</small>
        </span>
      </label>)}
    </fieldset> : <small role="status">No active inventory item matches this search.</small>)}
    <div className={styles.actions}>
      <button className="button" type="submit" disabled={!selected}>Confirm Match</button>
      <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
    </div>
  </form>;
}
