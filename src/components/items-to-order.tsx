"use client";

import { useState } from "react";

type OrderItem = {
  id: string;
  item_code: string;
  description: string;
  balance_qty: number | string | null;
  reorder_level: number | string | null;
  unit: string | null;
};

export function ItemsToOrder({ rows }: { rows: OrderItem[] }) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return <p className="dashboard-empty">No items currently require ordering.</p>;

  return <>
    <div className="table-wrap"><table className="table inventory-table">
      <thead><tr><th>Item Code</th><th>Description</th><th>Balance</th><th>Reorder Level</th><th>Qty to Order</th><th>Status</th></tr></thead>
      <tbody>{(expanded ? rows : rows.slice(0, 5)).map((item) => {
        const balance = Number(item.balance_qty);
        const reorder = Number(item.reorder_level);
        return <tr key={item.id}>
          <td><strong>{item.item_code}</strong></td><td>{item.description}</td>
          <td>{balance} {item.unit || ""}</td><td>{reorder} {item.unit || ""}</td>
          <td><strong>{Math.max(0, reorder - balance)} {item.unit || ""}</strong></td>
          <td><span className={`stock-state ${balance <= 0 ? "out" : "near"}`}>{balance <= 0 ? "Out of Stock" : "Near Reorder"}</span></td>
        </tr>;
      })}</tbody>
    </table></div>
    {rows.length > 5 && <button type="button" className="button secondary-button" style={{ marginTop: 16 }} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
      {expanded ? "Show first 5 items" : `Show all ${rows.length} items`}
    </button>}
  </>;
}
