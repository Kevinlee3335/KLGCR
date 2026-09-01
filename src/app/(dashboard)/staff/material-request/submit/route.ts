import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const form = await request.formData();
  const jobId = String(form.get("jobId") || "");
  const itemId = String(form.get("itemId") || "");
  const qty = Number(form.get("qty"));
  const note = String(form.get("note") || "");
  const url = new URL("/staff/material-request", request.url);
  if (!jobId || !itemId || !Number.isFinite(qty) || qty <= 0) {
    url.searchParams.set("error", "Select a job, material and valid quantity.");
    return NextResponse.redirect(url, 303);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_material_request", { p_job_id: jobId, p_note: note, p_items: [{ inventory_item_id: itemId, qty }] });
  if (error) url.searchParams.set("error", error.message); else url.searchParams.set("success", "created");
  return NextResponse.redirect(url, 303);
}
