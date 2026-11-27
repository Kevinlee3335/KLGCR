import { createClient } from "@/lib/supabase/server";

export type MaterialItem = {
  id: string;
  item_code: string;
  description: string;
  balance_qty: number | string;
  unit: string | null;
};

export async function getStaffMaterialCatalog(): Promise<MaterialItem[] | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("inventory_items")
      .select("id,item_code,description,balance_qty,unit")
      .eq("is_active", true)
      .order("description");
    return error ? null : data ?? [];
  } catch {
    return null;
  }
}
