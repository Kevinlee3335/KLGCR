"use client";

import { useId, useMemo, useRef, useState } from "react";

type MaterialItem = { id: string; item_code: string; description: string; balance_qty: number | string; unit: string | null };

export function MaterialItemPicker({ items, name, required }: { items: MaterialItem[]; name: string; required?: boolean }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MaterialItem | null>(null);
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState(false);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const normalize = (value: string) => value.toLowerCase().replace(/·/g, " ").replace(/\s+/g, " ").trim();
  const matches = useMemo(() => {
    const term = normalize(query);
    return term ? items.filter((item) => normalize(item.item_code + " " + item.description).includes(term)).slice(0, 12) : [];
  }, [items, query]);

  const choose = (item: MaterialItem) => {
    inputRef.current?.setCustomValidity("");
    setSelected(item);
    setQuery(item.item_code + " · " + item.description);
    setOpen(false);
  };

  return <div className="material-autocomplete">
    <div className="material-picker-options"><button type="button" className={`button secondary ${!other ? "is-selected" : ""}`} onClick={() => {setOther(false);setSelected(null);setQuery("");}}>Inventory item</button><button type="button" className={`button secondary ${other ? "is-selected" : ""}`} onClick={() => {setOther(true);setSelected(null);setQuery("");}}>Other Item</button></div>
    <input type="hidden" name={name} value={other ? "other" : selected?.id || ""} />
    <input type={other ? "text" : "hidden"} name="otherItemName" required={other} maxLength={200} placeholder="Enter the material name" aria-label="Other material name"/>
    {!other && <>
    <input
      ref={inputRef}
      type="search"
      value={query}
      onFocus={() => setOpen(!selected)}
      onBlur={() => {
        if (!selected && query.trim()) inputRef.current?.setCustomValidity("Choose a material from the search results.");
      }}
      onChange={(event) => {
        const value = event.target.value;
        const exact = items.find(item => normalize(item.item_code) === normalize(value) || normalize(item.item_code + " " + item.description) === normalize(value));
        setSelected(exact || null); setQuery(value); setOpen(!exact);
        event.target.setCustomValidity(value.trim() && !exact ? "Choose a material from the search results." : "");
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
    {open && !selected && query.trim() && matches.length === 0 && <small className="subtle">No active inventory item matches this search.</small>}
    {selected && <small className="subtle">Selected · Balance {selected.balance_qty} {selected.unit || ""}</small>}
    </>}
  </div>;
}
