import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normaliseInventorySheetRow } from "@/lib/inventory-google-sync";

export const runtime = "nodejs";

function syncDiagnostics(url: string, serviceKey: string) {
  let supabaseProject = "unknown";
  try { supabaseProject = new URL(url).hostname.split(".")[0] || "unknown"; } catch {}

  let keyKind = "unknown";
  let legacyKeyProject: string | null = null;
  if (serviceKey.startsWith("sb_secret_")) keyKind = "secret";
  else if (serviceKey.startsWith("eyJ")) {
    keyKind = "legacy-jwt";
    try {
      const payload = JSON.parse(Buffer.from(serviceKey.split(".")[1] || "", "base64url").toString("utf8"));
      legacyKeyProject = typeof payload.ref === "string" ? payload.ref : null;
    } catch {}
  } else if (serviceKey.startsWith("sb_publishable_")) keyKind = "publishable (wrong)";
  return { supabaseProject, keyKind, legacyKeyProject };
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-klgcr-inventory-secret");
  if (!process.env.GOOGLE_INVENTORY_SYNC_SECRET || secret !== process.env.GOOGLE_INVENTORY_SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { items?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 1000) {
    return NextResponse.json({ error: "Send between 1 and 1000 inventory items" }, { status: 400 });
  }
  const invalid = body.items.filter((item) => !normaliseInventorySheetRow(item));
  if (invalid.length) return NextResponse.json({ error: `${invalid.length} row(s) have missing or invalid stock data` }, { status: 400 });
  const rows = body.items.map((item) => normaliseInventorySheetRow(item)!).map((item) => ({
    item_code: item.itemCode, description: item.description, category: item.category,
    movement_category: item.movementCategory, balance_qty: item.balanceQty,
    reorder_level: item.reorderLevel, unit: item.unit, is_active: true,
  }));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Inventory sync is not configured" }, { status: 500 });
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error } = await supabase.from("inventory_items").upsert(rows, { onConflict: "item_code" });
  if (error) {
    const diagnostics = syncDiagnostics(url, serviceKey);
    console.error("Google inventory import failed", { error, diagnostics });
    return NextResponse.json({ error: "Inventory import failed", message: error.message, diagnostics }, { status: 500 });
  }
  return NextResponse.json({ ok: true, imported: rows.length });
}
