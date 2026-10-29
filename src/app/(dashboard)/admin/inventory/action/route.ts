import { requireRole } from "@/lib/auth";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushInventoryItemToGoogle } from "@/lib/inventory-google-sync";

function numberField(value: FormDataEntryValue | null, allowNull = false) {
  const text = String(value || "").trim();
  if (allowNull && !text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : NaN;
}

export async function POST(request: Request) {
  await requireRole(["admin"]);
  const form = await request.formData();
  const url = new URL("/admin/inventory", request.url);
  const store = form.get("store") === "office" ? "office" : form.get("store") === "cleaner" ? "cleaner" : "building";
  url.searchParams.set("store",store);
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
      inventory_group: store,
      item_code: String(form.get("itemCode") || "").trim(),
      description: String(form.get("description") || "").trim(),
      category: String(form.get("category") || ""),
      movement_category: String(form.get("movement") || "slow"),
      balance_qty: balance,
      reorder_level: reorder,
      unit: String(form.get("unit") || "").trim() || null,
      cost,
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
    }).eq("id", itemId));
  } else if (action === "stock_out") {
    const itemId = String(form.get("itemId") || "");
    const qty = numberField(form.get("qty"));
    const takenBy = String(form.get("takenBy") || "").trim();
    const purpose = String(form.get("note") || "").trim();
    if (!itemId || !Number.isFinite(qty) || qty! <= 0 || Math.abs(qty! * 100 - Math.round(qty! * 100)) > 0.000001 || !takenBy || takenBy.length > 100 || !purpose || purpose.length > 500) {
      url.searchParams.set("error", "Enter a valid quantity, recipient and purpose.");
      return NextResponse.redirect(url, 303);
    }
    const { data: available } = await supabase.from("inventory_items").select("id,quantity_unverified").eq("id", itemId).eq("inventory_group", store).eq("is_active", true).maybeSingle();
    if (!available || available.quantity_unverified) {
      url.searchParams.set("error", "Select an active item with a confirmed stock quantity.");
      return NextResponse.redirect(url, 303);
    }
    // The existing RPC locks the item and commits the deduction and audit row together.
    ({ error } = await supabase.rpc("adjust_inventory_item", {
      p_item_id: itemId, p_type: "correction_remove", p_qty: qty,
      p_note: `Stock Out | Taken by: ${takenBy} | Purpose: ${purpose}`,
    }));
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

  if (error) url.searchParams.set("error", error.message);
  else {
    const itemId = action === "create" ? null : String(form.get("itemId") || "");
    const itemCode = action === "create" ? String(form.get("itemCode") || "").trim() : null;
    const query = itemId ? supabase.from("inventory_items").select("item_code,description,category,movement_category,balance_qty,reorder_level,unit").eq("id", itemId).maybeSingle() : supabase.from("inventory_items").select("item_code,description,category,movement_category,balance_qty,reorder_level,unit").eq("item_code", itemCode!).maybeSingle();
    const { data: item } = await query;
    if (item) {
      const sync = await pushInventoryItemToGoogle(item);
      if (!sync.skipped && !sync.ok) url.searchParams.set("warning", "Stock saved. Google Sheet sync failed; please retry syncing.");
    }
    url.searchParams.set("success", action);
    url.searchParams.set("view", "all");
  }
  return NextResponse.redirect(url, 303);
}
