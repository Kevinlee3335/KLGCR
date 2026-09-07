import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const form = await request.formData();
  const requestId = String(form.get("requestId") || "");
  const action = String(form.get("action") || "");
  const reason = String(form.get("reason") || "");
  const returnTo = String(form.get("returnTo") || "");
  const url = new URL(returnTo.startsWith("/admin/material-requests") ? returnTo : "/admin/material-requests", request.url);
  if (!requestId) { url.searchParams.set("error", "Request is required."); return NextResponse.redirect(url, 303); }
  const supabase = await createClient();
  let error: { message: string } | null = null;
  if (action === "approve") ({ error } = await supabase.rpc("review_material_request", { p_request_id: requestId, p_approve: true, p_reason: null }));
  else if (action === "partial") {
    const itemIds = form.getAll("itemId").map(String);
    const quantities = form.getAll("approvedQty").map(Number);
    const items = itemIds.map((item_id, index) => ({ item_id, approved_qty: quantities[index] }));
    ({ error } = await supabase.rpc("review_material_request_quantities", { p_request_id: requestId, p_items: items, p_remark: reason || null }));
  }
  else if (action === "reject") ({ error } = await supabase.rpc("review_material_request", { p_request_id: requestId, p_approve: false, p_reason: reason }));
  else if (action === "issue") ({ error } = await supabase.rpc("issue_material_request", { p_request_id: requestId }));
  else if (action === "cancel") ({ error } = await supabase.rpc("cancel_material_request", { p_request_id: requestId, p_reason: reason }));
  else error = { message: "Unknown action." };
  if (error) url.searchParams.set("error", error.message); else url.searchParams.set("success", action);
  return NextResponse.redirect(url, 303);
}
