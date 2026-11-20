import type { SupabaseClient } from "@supabase/supabase-js";
import { inventoryCodePreview, inventoryCodeSeries } from "./inventory-new-item";

export async function insertNumberedInventoryItem(supabase: Pick<SupabaseClient, "from">, values: Record<string, unknown> & { category: string }) {
  const config = inventoryCodeSeries(values.category);
  if (!config) return { itemCode: null, error: { message: "Select a valid category." } };
  // Include inactive items and every page. Never recycle a retired item's code.
  // The database unique constraint arbitrates concurrent inserts; a conflict retries
  // against a fresh catalog instead of trusting the browser's earlier preview.
  for (let attempt = 0; attempt < 5; attempt++) {
    const codes: { item_code: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("inventory_items").select("item_code")
        .or(`item_code.ilike.${config.prefix}%,item_code.ilike.${config.prefix.replace(/^KLGCR-/, "")}%`)
        .order("item_code").range(from, from + 999);
      if (error) return { itemCode: null, error };
      codes.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const itemCode = inventoryCodePreview(values.category, codes)!.next;
    const { error } = await supabase.from("inventory_items").insert({ ...values, item_code: itemCode });
    if (!error) return { itemCode, error: null };
    if (error.code !== "23505") return { itemCode: null, error };
  }
  return { itemCode: null, error: { message: "Other items are being added. Please try saving again." } };
}
