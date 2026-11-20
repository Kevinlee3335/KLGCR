"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { PackagePlus, Plus, Sparkles, X } from "lucide-react";
import { inventoryCategories, inventoryCodePreview, matchingInventoryItems, suggestInventoryCategory, type InventoryCodeItem, type InventoryStore } from "@/lib/inventory-new-item";
import styles from "./inventory-new-item.module.css";

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className="button" type="submit" disabled={disabled || pending}>{pending ? "Creating…" : "Create Item"}</button>;
}

export function InventoryNewItem({ items, store, unavailable = false }: { items: InventoryCodeItem[]; store: InventoryStore; unavailable?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [description, setDescription] = useState("");
  const [manualCategory, setManualCategory] = useState<string | null>(null);
  const categories = inventoryCategories(store);
  const suggested = suggestInventoryCategory(description, store, items);
  const category = manualCategory ?? suggested;
  const preview = inventoryCodePreview(category, items);
  const matches = matchingInventoryItems(description, items);
  function open() {
    form.current?.reset();
    setDescription("");
    setManualCategory(null);
    dialog.current?.showModal();
  }
  return <>
    <button type="button" className="button" onClick={open} disabled={unavailable}><Plus size={18} aria-hidden="true"/>New Item</button>
    {unavailable && <p className="error">Refresh the inventory catalog before adding a new item.</p>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="new-item-title">
      <div className={styles.content}>
        <div className={styles.header}>
          <span className={styles.icon}><PackagePlus size={25} aria-hidden="true"/></span>
          <button type="button" className={styles.close} aria-label="Close new item" onClick={() => dialog.current?.close()}><X size={22} aria-hidden="true"/></button>
        </div>
        <h2 id="new-item-title">New Inventory Item</h2>
        <p className={styles.subtitle}>Start with the item name. We will suggest its category and next item code.</p>
        <form ref={form} action="/admin/inventory/action" method="post" className={`inventory-form ${styles.form}`}>
          <input type="hidden" name="action" value="create"/>
          <input type="hidden" name="store" value={store}/>
          <input type="hidden" name="autoCode" value="true"/>
          <label className="span-2"><span>Item Name / Description</span><input autoFocus name="description" value={description} onChange={event => setDescription(event.target.value)} placeholder="e.g. PVC JOINT : 20 MM (GREY PIPE)" maxLength={500} required/></label>
          {matches.length > 0 && <div className={`span-2 ${styles.matches}`} role="status"><strong>Similar items already exist</strong><p>Check these before creating another item.</p>{matches.map(item => <a key={item.item_code} href={`/admin/inventory?store=${store}&q=${encodeURIComponent(item.item_code)}#inventory-stock-list`} target="_blank" rel="noopener">{item.item_code} · {item.description}</a>)}</div>}
          <label className="span-2"><span>Category</span><select name="category" value={category} onChange={event => setManualCategory(event.target.value || null)} required><option value="">Select category</option>{categories.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          <div className={`span-2 ${styles.suggestion}`} role="status">
            <Sparkles size={17} aria-hidden="true"/>
            <span>{manualCategory !== null ? "Category selected manually." : suggested ? `Automatically classified as ${suggested}. You can change it.` : description.trim() ? "Category could not be determined. Please select it above." : "Enter an item name to detect its category."}</span>
            {manualCategory !== null && <button type="button" onClick={() => setManualCategory(null)}>Use auto</button>}
          </div>
          <div className={`span-2 ${styles.codes}`} aria-live="polite"><div><span>Latest Item Code</span><strong>{preview?.latest ?? (category ? "First item in this category" : "Select a category")}</strong></div><div><span>New Item Code</span><strong>{preview?.next ?? "Generated automatically"}</strong></div><small>The final code is assigned when you save, using the latest available number.</small></div>
          <label><span>Movement</span><select name="movement" defaultValue="fast"><option value="fast">Fast Moving</option><option value="slow">Slow Moving</option><option value="once_in_a_while">Once in a while</option></select></label>
          <label><span>Unit</span><input name="unit" placeholder="pcs / box / tube"/></label>
          <label><span>Opening Balance</span><input name="balance" type="number" min="0" step="0.01" defaultValue="0" required/></label>
          <label><span>Reorder Level</span><input name="reorder" type="number" min="0" step="0.01" defaultValue="0" required/></label>
          <label className="span-2"><span>Cost (RM)</span><input name="cost" type="number" min="0" step="0.01"/></label>
          <div className={`span-2 ${styles.actions}`}><button type="button" className="button secondary-button" onClick={() => dialog.current?.close()}>Cancel</button><SaveButton disabled={!category || !description.trim()}/></div>
        </form>
      </div>
    </dialog>
  </>;
}
