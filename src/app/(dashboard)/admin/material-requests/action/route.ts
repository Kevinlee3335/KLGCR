import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const form = await request.formData();
  const requestId = String(form.get("requestId") || "");
  const action = String(form.get("action") || "");
  const reason = String(form.get("reason") || "");
  const url = new URL("/admin/material-requests", request.url);
  if (!requestId) { url.searchParams.set("error", "Request is required."); return NextResponse.redirect(url, 303); }
  const supabase = await createClient();
  let error: { message: string } | null = null;
  if (action === "approve") ({ error } = await supabase.rpc("review_material_request", { p_request_id: requestId, p_approve: true, p_reason: null }));
  else if (action === "reject") ({ error } = await supabase.rpc("review_material_request", { p_request_id: requestId, p_approve: false, p_reason: reason }));
  else if (action === "issue") ({ error } = await supabase.rpc("issue_material_request", { p_request_id: requestId }));
  else error = { message: "Unknown action." };
  if (error) url.searchParams.set("error", error.message); else url.searchParams.set("success", action);
  return NextResponse.redirect(url, 303);
}
