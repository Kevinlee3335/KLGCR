"use client";

import { useMemo, useState } from "react";

export type MaterialSearchItem = { id:string; item_code:string; description:string; balance_qty:number; unit:string|null };

export function MaterialAutocomplete({ items, slot, required=false }: { items:MaterialSearchItem[]; slot:number; required?:boolean }) {
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState<MaterialSearchItem|null>(null);
  const matches=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q) return [];
    return items.filter(item=>item.description.toLowerCase().includes(q)||item.item_code.toLowerCase().includes(q)).slice(0,8);
  },[items,query]);
  const choose=(item:MaterialSearchItem)=>{setSelected(item);setQuery(`${item.item_code} · ${item.description}`)};
  return <div className="material-autocomplete">
    <input type="hidden" name="itemId" value={selected?.id||""}/>
    <label className="material-field material-select-field"><span>Material</span><input value={query} onChange={e=>{setQuery(e.target.value);setSelected(null)}} placeholder="Search item name or item code" autoComplete="off" required={required} aria-label={`Search material ${slot}`}/></label>
    {matches.length>0&&!selected&&<div className="material-search-results">{matches.map(item=><button type="button" key={item.id} onClick={()=>choose(item)}><strong>{item.item_code}</strong><span>{item.description}</span><small>Balance {item.balance_qty} {item.unit||""}</small></button>)}</div>}
    {query&&!selected&&matches.length===0&&<small className="material-no-result">No matching material found.</small>}
    {selected&&<small className="material-selected">Selected · Balance {selected.balance_qty} {selected.unit||""}</small>}
  </div>;
}
