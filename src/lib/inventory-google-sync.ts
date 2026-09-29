type InventorySheetRow = {
  itemCode: string;
  description: string;
  category: string;
  movementCategory?: "fast" | "slow" | "once_in_a_while";
  balanceQty: number;
  reorderLevel?: number;
  unit?: string | null;
};

export function normaliseInventorySheetRow(value: unknown): InventorySheetRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const rawCode = String(row.itemCode ?? "").trim().toUpperCase();
  const itemCode = rawCode && !rawCode.startsWith("KLGCR-") ? `KLGCR-${rawCode}` : rawCode;
  const description = String(row.description ?? "").trim();
  const category = String(row.category ?? "").trim();
  const balanceQty = Number(row.balanceQty);
  const reorderLevel = row.reorderLevel == null || row.reorderLevel === "" ? 0 : Number(row.reorderLevel);
  const movementCategory = row.movementCategory === "fast" || row.movementCategory === "once_in_a_while" ? row.movementCategory : "slow";
  const unit = String(row.unit ?? "").trim() || null;
  if (!itemCode || !description || !category || !Number.isFinite(balanceQty) || balanceQty < 0 || !Number.isFinite(reorderLevel) || reorderLevel < 0) return null;
  return { itemCode, description, category, balanceQty, reorderLevel, movementCategory, unit };
}

export async function pushInventoryItemToGoogle(item: {
  item_code: string; description: string; category: string; movement_category: string;
  balance_qty: number | string; reorder_level: number | string; unit: string | null;
}) {
  const url = process.env.GOOGLE_INVENTORY_APPS_SCRIPT_URL;
  const secret = process.env.GOOGLE_INVENTORY_SYNC_SECRET;
  if (!url || !secret) return { skipped: true };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "update_balance", secret,
        item: {
          itemCode: item.item_code.replace(/^KLGCR-/i, ""), description: item.description, category: item.category,
          movementCategory: item.movement_category, balanceQty: Number(item.balance_qty),
          reorderLevel: Number(item.reorder_level), unit: item.unit,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    // Apps Script returns HTTP 200 even when its JSON reports a failed update.
    const result = await response.json().catch(() => null);
    const ok = response.ok && result?.ok === true;
    if (!ok) console.error("Google inventory sync failed", response.status, result?.error || "Invalid response");
    return { skipped: false, ok };
  } catch (error) {
    console.error("Google inventory sync failed", error);
    return { skipped: false, ok: false };
  }
}
