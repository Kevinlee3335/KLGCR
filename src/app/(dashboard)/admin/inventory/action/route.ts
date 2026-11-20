import { requireRole } from "@/lib/auth";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushInventoryItemToGoogle } from "@/lib/inventory-google-sync";
import { inventoryCategories } from "@/lib/inventory-new-item";
import { insertNumberedInventoryItem } from "@/lib/inventory-new-item.server";

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
  let createdItemCode = String(form.get("itemCode") || "").trim();

  if (action === "procurement_mode") {
    const itemIds = [...new Set(form.getAll("itemIds").map(String))];
    const mode = String(form.get("mode") || "");
    if (!itemIds.length || itemIds.length > 1000 || itemIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) || !["maintain_stock", "buy_when_needed"].includes(mode)) {
      url.searchParams.set("error", "Select valid materials and a purchase mode.");
      return NextResponse.redirect(url, 303);
    }
    const result = await supabase.rpc("set_inventory_procurement_mode", {
      p_item_ids: itemIds, p_store: store, p_mode: mode,
    });
    if (result.error) url.searchParams.set("error", result.error.message);
    else url.searchParams.set("success", mode);
    url.searchParams.set("purchaseView", mode === "maintain_stock" ? "hidden" : "order");
    url.hash = "items-to-order";
    return NextResponse.redirect(url, 303);
  }

  if (action === "create") {
    const description = String(form.get("description") || "").trim();
    const category = String(form.get("category") || "");
    const autoCode = form.get("autoCode") === "true";
    const movement = String(form.get("movement") || "slow");
    if (!description || description.length > 500 || !inventoryCategories(store).includes(category) || !["fast", "slow", "once_in_a_while"].includes(movement) || (!autoCode && !createdItemCode)) {
      url.searchParams.set("error", "Enter an item name and select a valid category and movement for this store.");
      return NextResponse.redirect(url, 303);
    }
    const balance = numberField(form.get("balance"));
    const reorder = numberField(form.get("reorder"));
    const cost = numberField(form.get("cost"), true);
    if (!Number.isFinite(balance) || balance! < 0 || !Number.isFinite(reorder) || reorder! < 0 || (cost !== null && (!Number.isFinite(cost) || cost < 0))) {
      url.searchParams.set("error", "Enter valid stock quantities and cost.");
      return NextResponse.redirect(url, 303);
    }
    const values = {
      inventory_group: store,
      description,
      category,
      movement_category: movement,
      balance_qty: balance,
      reorder_level: reorder,
      unit: String(form.get("unit") || "").trim() || null,
      cost,
    };
    if (autoCode) {
      const result = await insertNumberedInventoryItem(supabase, values);
      error = result.error;
      createdItemCode = result.itemCode ?? "";
    } else {
      ({ error } = await supabase.from("inventory_items").insert({ ...values, item_code: createdItemCode }));
    }
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
    const itemCode = action === "create" ? createdItemCode : null;
    const query = itemId ? supabase.from("inventory_items").select("item_code,description,category,movement_category,balance_qty,reorder_level,unit").eq("id", itemId).maybeSingle() : supabase.from("inventory_items").select("item_code,description,category,movement_category,balance_qty,reorder_level,unit").eq("item_code", itemCode!).maybeSingle();
    const { data: item } = await query;
    if (item) {
      const sync = await pushInventoryItemToGoogle(item);
      if (!sync.skipped && !sync.ok) url.searchParams.set("warning", "Stock saved. Google Sheet sync failed; please retry syncing.");
    }
    url.searchParams.set("success", action);
    url.searchParams.set("view", "all");
    if (action === "create") {
      url.searchParams.set("q", createdItemCode);
      url.hash = "inventory-stock-list";
    }
  }
  return NextResponse.redirect(url, 303);
}
