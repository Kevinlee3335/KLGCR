"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { MaterialItem } from "@/lib/staff-material-catalog";

type PickerProps = {
  items: MaterialItem[];
  name: string;
  required?: boolean;
  status?: "loading" | "ready" | "error";
  retryCatalog?: () => void;
};

const normalize = (value: string) => value.toLowerCase().replace(/·/g, " ").replace(/\s+/g, " ").trim();

export function MaterialItemPicker({ items, name, required, status = "ready", retryCatalog }: PickerProps) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<MaterialItem | null>(null);
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState(false);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const term = normalize(query);
  const selected = useMemo(() => chosen || (term ? items.find(item =>
    normalize(item.item_code) === term || normalize(item.item_code + " " + item.description) === term
  ) : null), [chosen, items, term]);
  const matches = useMemo(() => {
    if (!term || selected || !open) return [];
    const found: MaterialItem[] = [];
    for (const item of items) {
      if (normalize(item.item_code + " " + item.description).includes(term)) found.push(item);
      if (found.length === 12) break;
    }
    return found;
  }, [items, term, selected, open]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(query.trim() && !selected ? "Choose a material from the search results." : "");
  }, [query, selected]);

  const choose = (item: MaterialItem) => {
    inputRef.current?.setCustomValidity("");
    setChosen(item);
    setQuery(item.item_code + " · " + item.description);
    setOpen(false);
  };

  return <div className="material-autocomplete">
    <div className="material-picker-options"><button type="button" className={`button secondary ${!other ? "is-selected" : ""}`} onClick={() => {setOther(false);setChosen(null);setQuery("");}}>Inventory item</button><button type="button" className={`button secondary ${other ? "is-selected" : ""}`} onClick={() => {setOther(true);setChosen(null);setQuery("");}}>Other Item</button></div>
    <input type="hidden" name={name} value={other ? "other" : selected?.id || ""} />
    <input type={other ? "text" : "hidden"} name="otherItemName" required={other} maxLength={200} placeholder="Enter the material name" aria-label="Other material name"/>
    {!other && <>
    <input
      ref={inputRef}
      type="search"
      value={query}
      onFocus={() => setOpen(!selected)}
      onChange={(event) => {
        setChosen(null);
        setQuery(event.target.value);
        setOpen(true);
      }}
      placeholder="Type item name or code (e.g. window, P00003)"
      aria-label="Search inventory item"
      aria-autocomplete="list"
      role="combobox"
      aria-controls={listId}
      aria-expanded={open && matches.length > 0}
      required={required && !selected}
    />
    {open && matches.length > 0 && <div id={listId} className="material-autocomplete-list" role="listbox">
      {matches.map((item) => <button type="button" role="option" aria-selected={selected?.id===item.id} key={item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}>
        <strong>{item.item_code}</strong><span>{item.description}</span><small>Balance {item.balance_qty} {item.unit || ""}</small>
      </button>)}
    </div>}
    {open && status === "loading" && <small role="status" className="subtle">Loading inventory…</small>}
    {open && status === "error" && <div>
      <small role="alert">Unable to load inventory.</small>
      <button type="button" className="button secondary" onClick={retryCatalog}>Retry</button>
    </div>}
    {open && status === "ready" && !selected && query.trim() && matches.length === 0 && <small className="subtle">No active inventory item matches this search.</small>}
    {selected && <small className="subtle">Selected · Balance {selected.balance_qty} {selected.unit || ""}</small>}
    </>}
  </div>;
}
