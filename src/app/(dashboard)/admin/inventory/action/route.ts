import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function numberField(value: FormDataEntryValue | null, allowNull = false) {
  const text = String(value || "").trim();
  if (allowNull && !text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : NaN;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const returnTo = String(form.get("returnTo") || "");
  const url = new URL(returnTo.startsWith("/admin/inventory") ? returnTo : "/admin/inventory", request.url);
  const action = String(form.get("action") || "");
  const supabase = await createClient();
  let error: { message: string } | null = null;

  if (action === "create") {
    const balance = numberField(form.get("balance"));
    const reorder = numberField(form.get("reorder"));
    const cost = numberField(form.get("cost"), true);
    if (!Number.isFinite(balance) || balance! < 0 || !Number.isFinite(reorder) || reorder! < 0 || (cost !== null && (!Number.isFinite(cost) || cost < 0))) {
      url.searchParams.set("error", "Enter valid stock quantities and cost.");
      return NextResponse.redirect(url, 303);
    }
    ({ error } = await supabase.from("inventory_items").insert({
      item_code: String(form.get("itemCode") || "").trim(),
      description: String(form.get("description") || "").trim(),
      category: String(form.get("category") || ""),
      movement_category: String(form.get("movement") || "slow"),
      balance_qty: balance,
      reorder_level: reorder,
      unit: String(form.get("unit") || "").trim() || null,
      cost,
      brand: String(form.get("brand") || "").trim() || null,
      supplier: String(form.get("supplier") || "").trim() || null,
      storage_location: String(form.get("location") || "").trim() || null,
      barcode: String(form.get("barcode") || "").trim() || null,
    }));
  } else if (action === "edit") {
    const itemId = String(form.get("itemId") || "");
    const reorder = numberField(form.get("reorder"));
    const cost = numberField(form.get("cost"), true);
    if (!itemId || !Number.isFinite(reorder) || reorder! < 0 || (cost !== null && (!Number.isFinite(cost) || cost < 0))) {
      url.searchParams.set("error", "Enter valid inventory details.");
      return NextResponse.redirect(url, 303);
    }
    ({ error } = await supabase.from("inventory_items").update({
      description: String(form.get("description") || "").trim(),
      category: String(form.get("category") || ""),
      movement_category: String(form.get("movement") || "slow"),
      reorder_level: reorder,
      unit: String(form.get("unit") || "").trim() || null,
      cost,
      is_active: form.get("isActive") === "on",
      brand: String(form.get("brand") || "").trim() || null,
      supplier: String(form.get("supplier") || "").trim() || null,
      storage_location: String(form.get("location") || "").trim() || null,
      barcode: String(form.get("barcode") || "").trim() || null,
      minimum_stock: numberField(form.get("minimum"), true),
      maximum_stock: numberField(form.get("maximum"), true),
      supplier_contact_person: String(form.get("contact") || "").trim() || null,
      supplier_phone: String(form.get("phone") || "").trim() || null,
      supplier_email: String(form.get("email") || "").trim() || null,
      supplier_lead_time_days: numberField(form.get("leadTime"), true),
    }).eq("id", itemId));
  } else if (action === "adjust") {
    const itemId = String(form.get("itemId") || "");
    const qty = numberField(form.get("qty"));
    const type = String(form.get("adjustmentType") || "");
    const note = String(form.get("note") || "").trim();
    if (!itemId || !Number.isFinite(qty) || qty! <= 0 || !["stock_in", "correction_add", "correction_remove"].includes(type) || !note) {
      url.searchParams.set("error", "Enter a valid quantity, adjustment type and note.");
      return NextResponse.redirect(url, 303);
    }
    ({ error } = await supabase.rpc("adjust_inventory_item", { p_item_id: itemId, p_type: type, p_qty: qty, p_note: note }));
  } else {
    url.searchParams.set("error", "Unknown action.");
    return NextResponse.redirect(url, 303);
  }

  if (error) url.searchParams.set("error", error.message); else url.searchParams.set("success", action);
  return NextResponse.redirect(url, 303);
}
