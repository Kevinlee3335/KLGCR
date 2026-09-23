"use client";

import { useState } from "react";

const defectOptions = [
  { area: "Room", items: [
    ["Door Handle", ["Loose", "Broken", "Missing", "Rusty"]], ["Door Closer", ["Loose", "Broken", "Missing"]], ["Door Lock / Key", ["Loose", "Broken", "Key Missing", "Rusty"]], ["Ceiling Fan", ["Noisy", "No Power", "Shaking"]], ["Air Conditioning", ["Not Cool", "No Power", "Leaking", "Remote Malfunction"]], ["Lighting", ["Not Working", "Broken"]], ["Divan", ["Broken", "Missing"]], ["Headboard", ["Broken", "Missing"]], ["Mattress", ["Broken", "Missing"]], ["Study Table", ["Broken", "Missing", "Bloated"]], ["Utility Table", ["Broken", "Missing", "Bloated"]], ["Bookshelf", ["Broken", "Missing", "Bloated"]], ["Wardrobe", ["Broken", "Missing", "Bloated"]], ["Chair", ["Broken", "Missing"]], ["Curtain", ["Broken", "Missing", "Dirty"]], ["Curtain Hook / Holder", ["Broken", "Missing"]], ["Floor", ["Water Mark", "Leaking", "Vinyl Tiles Broken"]], ["Wall", ["Water Seepage", "Mouldy", "Near Window", "Near Door", "Near Bathroom"]], ["Other", ["Other"]],
  ] },
  { area: "Bathroom", items: [
    ["Door Knob", ["Loose", "Broken", "Cannot Open"]], ["Water Tap / Sink Tap", ["Leaking", "Broken", "Slow Pressure"]], ["Shower Valve", ["Leaking", "Broken", "Slow Pressure"]], ["Toilet Seat", ["Dirty", "Broken"]], ["Flexible Hose", ["Leaking", "Broken"]], ["Other", ["Other"]],
  ] },
  { area: "Common Area", items: [["Lighting", ["Not Working", "Broken"]], ["Water Leakage", ["Leaking"]], ["Other", ["Other"]]] },
] as const;

type Entry = { area: string; item: string; issue: string; other: string };
const blank = (): Entry => ({ area: "Room", item: "", issue: "", other: "" });

export function CheckoutDefectPicker({ name, required = false }: { name: string; required?: boolean }) {
  const [entries, setEntries] = useState<Entry[]>([blank()]);
  const update = (index: number, values: Partial<Entry>) => setEntries((current) => current.map((entry, i) => i === index ? { ...entry, ...values } : entry));
  const areaOptions = defectOptions.map((area) => area.area);
  const validEntries = entries.filter((entry) => entry.item && entry.issue && ((entry.item !== "Other" && entry.issue !== "Other") || entry.other.trim()))
    .map((entry) => ({ description: entry.item === "Other" || entry.issue === "Other" ? entry.other.trim() : entry.area + " · " + entry.item + " · " + entry.issue }));
  return <div className="checkout-defect-picker">
    <input type="hidden" name={name} value={JSON.stringify(validEntries)} required={required} />
    {entries.map((entry, index) => {
      const area = defectOptions.find((option) => option.area === entry.area) || defectOptions[0];
      const item = area.items.find(([label]) => label === entry.item);
      const needsOther = entry.item === "Other" || entry.issue === "Other";
      return <fieldset key={index} className="defect-picker-row">
        <legend>Defect {index + 1}</legend>
        <select value={entry.area} onChange={(event) => update(index, { area: event.target.value, item: "", issue: "", other: "" })}>
          {areaOptions.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={entry.item} onChange={(event) => update(index, { item: event.target.value, issue: "", other: "" })} required={required}>
          <option value="">Select defect item</option>
          {area.items.map(([label]) => <option key={label} value={label}>{label}</option>)}
        </select>
        <select value={entry.issue} onChange={(event) => update(index, { issue: event.target.value, other: "" })} required={required} disabled={!item}>
          <option value="">Select issue</option>
          {item?.[1].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        {needsOther && <input value={entry.other} onChange={(event) => update(index, { other: event.target.value })} placeholder="Describe the other defect" required />}
        {entries.length > 1 && <button type="button" className="button button-secondary" onClick={() => setEntries((current) => current.filter((_, i) => i !== index))}>Remove</button>}
      </fieldset>;
    })}
    <button type="button" className="button button-secondary" onClick={() => setEntries((current) => [...current, blank()])}>Add another defect</button>
  </div>;
}
