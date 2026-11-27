"use client";

import { useEffect, useRef, useState } from "react";
import type { MaterialItem } from "@/lib/staff-material-catalog";
import { MaterialItemPicker } from "@/components/material-item-picker";

export function MaterialRequestRows({ catalog }: { catalog: Promise<MaterialItem[] | null> }) {
  const [rows, setRows] = useState([1, 2, 3]);
  const next = useRef(4);
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const retry = useRef<AbortController | null>(null);

  useEffect(() => {
    let current = true;
    setStatus("loading");
    setItems([]);
    // Keep the form interactive while the server streams the shared catalog.
    catalog.then(data => {
      if (!current) return;
      setItems(data ?? []);
      setStatus(data ? "ready" : "error");
    }, () => {
      if (current) setStatus("error");
    });
    return () => {
      current = false;
      retry.current?.abort();
      retry.current = null;
    };
  }, [catalog]);

  async function retryCatalog() {
    if (retry.current || status !== "error") return;
    const controller = new AbortController();
    retry.current = controller;
    setStatus("loading");
    try {
      const response = await fetch("/api/staff/material-request/inventory", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Unable to load inventory.");
      const data = await response.json();
      if (!Array.isArray(data.items)) throw new Error("Invalid inventory response.");
      if (!controller.signal.aborted) {
        setItems(data.items);
        setStatus("ready");
      }
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    } finally {
      if (retry.current === controller) retry.current = null;
    }
  }

  return <div className="material-rows">
    {rows.map((id, index) => <fieldset className="material-row" key={id}>
      <legend>Material {index + 1}{index > 0 && <span>Optional</span>}</legend>
      <div className="material-field material-select-field">
        <span>Material</span>
        <MaterialItemPicker name="itemId" required={index === 0} items={items} status={status} retryCatalog={retryCatalog}/>
      </div>
      <label className="material-field material-quantity-field">
        <span>Quantity</span>
        <input name="qty" type="number" inputMode="decimal" min="0.01" step="0.01" required={index === 0}/>
      </label>
      {index > 0 && <button type="button" className="button secondary material-remove-row"
        aria-label={`Remove material ${index + 1}`} onClick={() => setRows(current => current.filter(row => row !== id))}>Remove</button>}
    </fieldset>)}
    <button type="button" className="button secondary material-add-row" onClick={() => {
      const id = next.current++;
      setRows(current => [...current, id]);
    }}>＋ Add Material</button>
  </div>;
}
