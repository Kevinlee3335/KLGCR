import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  await requireRole(["admin"]);
  const form = await request.formData();
  const url = new URL("/admin/inventory/room-history", request.url);
  for (const field of ["room", "material", "year"]) {
    url.searchParams.set(field, String(form.get(field) ?? ""));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_room_material_replacement", {
    p_item_id: String(form.get("itemId") ?? ""),
    p_room_no: String(form.get("room") ?? ""),
    p_used_qty: Number(form.get("usedQty")),
    p_replaced_on: String(form.get("replacedOn") ?? ""),
  });
  url.searchParams.set("result", error ? "error" : "saved");
  return NextResponse.redirect(url, 303);
}
