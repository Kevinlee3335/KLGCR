import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const form = await request.formData();
  const url = new URL("/admin/inventory", request.url);
  const action = String(form.get("action") || "");
  if (action !== "create") { url.searchParams.set("error", "Unknown action."); return NextResponse.redirect(url, 303); }
  const balance = Number(form.get("balance"));
  const reorder = Number(form.get("reorder"));
  const costText = String(form.get("cost") || "").trim();
  const cost = costText ? Number(costText) : null;
  if (!Number.isFinite(balance) || balance < 0 || !Number.isFinite(reorder) || reorder < 0 || (cost !== null && (!Number.isFinite(cost) || cost < 0))) { url.searchParams.set("error", "Enter valid stock quantities and cost."); return NextResponse.redirect(url, 303); }
  const supabase = await createClient();
  const { error } = await supabase.from("inventory_items").insert({ item_code: String(form.get("itemCode") || "").trim(), description: String(form.get("description") || "").trim(), category: String(form.get("category") || ""), movement_category: String(form.get("movement") || "slow"), balance_qty: balance, reorder_level: reorder, unit: String(form.get("unit") || "").trim() || null, cost });
  if (error) url.searchParams.set("error", error.message); else url.searchParams.set("success", "created");
  return NextResponse.redirect(url, 303);
}
