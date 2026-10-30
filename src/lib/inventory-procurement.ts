export type ProcurementItem = {
  id: string;
  item_code: string;
  description: string;
  category: string;
  balance_qty: number | string | null;
  reorder_level: number | string | null;
  unit: string | null;
  is_active: boolean;
  quantity_unverified?: boolean;
  stock_group: string | null;
  procurement_mode: string;
};

export type ProcurementRow = {
  id: string;
  itemIds: string[];
  item_code: string;
  description: string;
  brands: string[];
  balance_qty: number;
  reorder_level: number;
  unit: string | null;
  buyWhenNeeded: boolean;
  needsOrder: boolean;
  unverified: boolean;
};

// Always aggregate the complete store before applying display/search filters.
export function procurementRows(items: ProcurementItem[]): ProcurementRow[] {
  const groups = new Map<string, ProcurementItem[]>();
  for (const item of items) {
    if (!item.is_active) continue;
    const key = item.stock_group ? `group:${item.stock_group}` : item.id;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.entries()].map(([key, members]) => {
    const first = members[0];
    const grouped = Boolean(first.stock_group);
    const balance = members.reduce((sum, item) => sum + Number(item.balance_qty), 0);
    // Existing minimums represent one shared minimum, never their sum.
    const minimum = Math.max(...members.map((item) => Number(item.reorder_level)));
    const unverified = members.some((item) => item.quantity_unverified);
    const buyWhenNeeded = members.some((item) => item.procurement_mode === "buy_when_needed");
    return {
      id: key, itemIds: members.map((item) => item.id),
      item_code: members.map((item) => item.item_code).join(" / "),
      description: first.stock_group || first.description,
      brands: grouped ? members.map((item) => `${item.item_code} · ${item.description} · ${Number(item.balance_qty)}`) : [],
      balance_qty: balance, reorder_level: minimum,
      unit: grouped ? (first.stock_group === "Standard Cement 50kg" ? "bags" : "drums") : first.unit,
      buyWhenNeeded, unverified,
      needsOrder: !unverified && !buyWhenNeeded && (balance <= 0 || (grouped ? balance < minimum : balance <= minimum)),
    };
  });
}
