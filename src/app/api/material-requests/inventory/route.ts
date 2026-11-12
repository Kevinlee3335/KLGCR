import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  try {
    const profile = await getSessionProfile();
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Access denied" }, { status: 403, headers });
    }

    const term = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (term.length < 2 || term.length > 100 || term.includes("\0")) {
      return NextResponse.json({ error: "Enter 2 to 100 characters to search inventory." }, { status: 400, headers });
    }

    // imatch's ***= prefix makes the PostgreSQL pattern literal, including asterisks.
    // Escape quotes and backslashes separately for the PostgREST OR filter grammar.
    const pattern = '"***=' + term.replace(/[\\"]/g, "\\$&") + '"';
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("inventory_items")
      .select("id,item_code,description,inventory_group,balance_qty,unit,quantity_unverified")
      .eq("is_active", true)
      .or("item_code.imatch." + pattern + ",description.imatch." + pattern)
      .order("item_code")
      .order("id")
      .limit(20);

    if (error) throw error;
    return NextResponse.json({ items: data ?? [] }, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to search inventory. Please try again." }, { status: 503, headers });
  }
}
