"use client";

import { useId, useMemo, useState } from "react";

type MaterialItem = { id: string; item_code: string; description: string; balance_qty: number | string; unit: string | null };

export function MaterialItemPicker({ items, name, required }: { items: MaterialItem[]; name: string; required?: boolean }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MaterialItem | null>(null);
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState(false);
  const listId = useId();
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? items.filter((item) => (item.item_code + " " + item.description).toLowerCase().includes(term)).slice(0, 12) : [];
  }, [items, query]);

  const choose = (item: MaterialItem) => {
    setSelected(item);
    setQuery(item.item_code + " · " + item.description);
    setOpen(false);
  };

  return <div className="material-autocomplete">
    <div className="material-picker-options"><button type="button" className={`button secondary ${!other ? "is-selected" : ""}`} onClick={() => {setOther(false);setQuery("");}}>Inventory item</button><button type="button" className={`button secondary ${other ? "is-selected" : ""}`} onClick={() => {setOther(true);setSelected(null);setQuery("");}}>Other Item</button></div>
    <input type="hidden" name={name} value={other ? "other" : selected?.id || ""} />
    <input type={other ? "text" : "hidden"} name="otherItemName" required={other} maxLength={200} placeholder="Enter the material name" aria-label="Other material name"/>
    {!other && <>
    <input
      type="search"
      value={query}
      onFocus={() => setOpen(true)}
      onChange={(event) => { setSelected(null); setQuery(event.target.value); setOpen(true); }}
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
    {open && query.trim() && matches.length === 0 && <small className="subtle">No active inventory item matches this search.</small>}
    </>}
  </div>;
}
