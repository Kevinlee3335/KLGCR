import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { getStaffMaterialCatalog } from "@/lib/staff-material-catalog";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const profile = await getSessionProfile();
  if (profile?.role !== "maintenance_staff") {
    return NextResponse.json({ error: "Access denied." }, { status: 403, headers });
  }

  const items = await getStaffMaterialCatalog();
  if (!items) return NextResponse.json({ error: "Unable to load inventory." }, { status: 503, headers });
  return NextResponse.json({ items }, { headers });
}
