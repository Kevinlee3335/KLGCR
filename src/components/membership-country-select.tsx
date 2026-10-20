"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Globe2, Search } from "lucide-react";
import { MEMBERSHIP_COUNTRY_OPTIONS } from "@/lib/membership-countries";
function Flag({code}:{code:string}){
 return <img className="country-flag" src={"https://flagcdn.com/w40/"+code.toLowerCase()+".png"} alt="" width={24} height={18} loading="lazy" referrerPolicy="no-referrer"/>;
}
export function MembershipCountrySelect({locked,value,onChange}:{locked:boolean;value:string;onChange:(value:string)=>void}){
 const id=useId(),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),search=useRef<HTMLInputElement>(null),list=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false),[query,setQuery]=useState(""),[active,setActive]=useState(0),[above,setAbove]=useState(false);
 const selected=MEMBERSHIP_COUNTRY_OPTIONS.find(country=>country.name===value);
 const clean=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 const needle=clean(query.trim());
 const filtered=MEMBERSHIP_COUNTRY_OPTIONS.filter(country=>clean(country.name).includes(needle)||country.code.toLowerCase()===needle);
 useEffect(()=>{setOpen(false);setQuery("");},[locked]);
 useEffect(()=>{
  if(!open)return;
  search.current?.focus();
  function outside(event:PointerEvent){if(!root.current?.contains(event.target as Node))setOpen(false);}
  document.addEventListener("pointerdown",outside);
  return()=>document.removeEventListener("pointerdown",outside);
 },[open]);
 useEffect(()=>{if(open)list.current?.querySelector('[data-active="true"]')?.scrollIntoView({block:"nearest"});},[active,open]);
 function show(){
  const box=trigger.current?.getBoundingClientRect();
  setAbove(Boolean(box&&window.innerHeight-box.bottom<330&&box.top>330));
  setQuery("");setActive(0);setOpen(true);
 }
 function choose(name:string){onChange(name);setOpen(false);setQuery("");trigger.current?.focus();}
 function keys(event:KeyboardEvent<HTMLElement>){
  if(event.key==="Escape"){event.preventDefault();setOpen(false);trigger.current?.focus();}
  else if(event.key==="ArrowDown"){event.preventDefault();if(!open)show();else setActive(current=>Math.min(current+1,filtered.length-1));}
  else if(event.key==="ArrowUp"){event.preventDefault();if(!open)show();else setActive(current=>Math.max(current-1,0));}
  else if(event.key==="Enter"&&open){event.preventDefault();if(filtered[active])choose(filtered[active].name);}
  else if(event.key==="Tab")setOpen(false);
 }
 if(locked)return <div className="country-field country-locked"><span id={id+"-label"} className="country-label">Nationality</span><div className="country-trigger" aria-labelledby={id+"-label"}><Flag code="MY"/><span>Malaysia</span><span className="country-auto">Auto</span></div><input type="hidden" name="nationality" value="Malaysia"/></div>;
 return <div className="country-field" ref={root}>
  <label className="country-label" id={id+"-label"} htmlFor={id}>Nationality</label>
  <button ref={trigger} id={id} type="button" className={"country-trigger"+(open?" is-open":"")} role="combobox" aria-labelledby={id+"-label"} aria-expanded={open} aria-controls={open?id+"-list":undefined} aria-haspopup="listbox" onClick={()=>open?setOpen(false):show()} onKeyDown={keys}>
   {selected?<Flag code={selected.code}/>:<Globe2 size={20} className="country-globe" aria-hidden="true"/>}<span className={selected?"":"country-placeholder"}>{selected?.name||"Select country"}</span><ChevronDown size={17} aria-hidden="true"/>
  </button>
  <input type="hidden" name="nationality" value={value}/>
  <input className="country-required" type="text" value={value} required tabIndex={-1} aria-label="Choose a nationality" onChange={()=>{}} onInvalid={event=>{event.preventDefault();show();}}/>
  {open&&<div className={"country-popup"+(above?" opens-above":"")}>
   <div className="country-search"><Search size={17} aria-hidden="true"/><input ref={search} type="search" placeholder="Search country…" aria-label="Search countries" autoComplete="off" value={query} onChange={event=>{setQuery(event.target.value);setActive(0);if(list.current)list.current.scrollTop=0;}} onKeyDown={keys} aria-controls={id+"-list"} aria-activedescendant={filtered[active]?id+"-"+filtered[active].code:undefined}/></div>
   <div ref={list} className="country-options" role="listbox" id={id+"-list"} aria-label="Countries">
    {filtered.map((country,index)=><div key={country.code} id={id+"-"+country.code} role="option" aria-selected={value===country.name} data-active={index===active} className={"country-option"+(value===country.name?" selected":"")} onPointerDown={event=>event.preventDefault()} onClick={()=>choose(country.name)} onMouseEnter={()=>setActive(index)}>
     <Flag code={country.code}/><span>{country.name}</span>{value===country.name&&<Check size={16} aria-hidden="true"/>}
    </div>)}
    {!filtered.length&&<p className="country-empty">No country found. Try another name.</p>}
   </div>
   <div className="country-count">{filtered.length} countries &amp; regions</div>
  </div>}
 </div>;
}
