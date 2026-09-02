import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type FormPayload = Record<string, unknown> & { source_reference?: string };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-klgcr-form-secret");
  if (!process.env.GOOGLE_FORM_WEBHOOK_SECRET || secret !== process.env.GOOGLE_FORM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: FormPayload;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const block = text(body["BLOCK"]);
  const room = text(body["ROOM NUMBER / COMMON AREA"]);
  const description = text(body["REPORT DESCRIPTION"]);
  const sourceReference = text(body.source_reference);
  if (!block || !room || !description || !sourceReference) {
    return NextResponse.json({ error: "Missing required form fields" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const normalizedBlock = block.replace(/^block\s+/i, "").trim().toUpperCase();
  const { data: blockRow, error: blockError } = await supabase
    .from("blocks")
    .select("id")
    .eq("code", normalizedBlock)
    .maybeSingle();
  if (blockError || !blockRow) return NextResponse.json({ error: "Unknown block" }, { status: 400 });

  const timestamp = text(body["Timestamp"]);
  const availabilityDate = text(body["ROOM AVAILABILITY (DATE)"]);
  const payload = {
    block_id: blockRow.id,
    room_no: room,
    category: text(body["MAINTENANCE TYPE"]) || "General",
    description,
    photo_url: text(body["PHOTO (IF APPLICABLE)"]) || null,
    status: "new",
    source: "google_form",
    source_reference: sourceReference,
    reporter_name: text(body["NAME"]) || null,
    reporter_phone: text(body["PHONE NUMBER (WHATSAPP)"]) || null,
    reporter_email: text(body["EMAIL ADDRESS"]) || text(body["Email Address"]) || null,
    availability_date: availabilityDate || null,
    availability_time: text(body["ROOM AVAILABILITY (TIME)"]) || null,
    room_access_permission: text(body["REQUEST FOR ROOM ACCESS DUE TO TENANT'S UNAVAILABILITY"]) || null,
    submitted_at: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
  };

  const { data, error } = await supabase.from("complaints").insert(payload).select("id").single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    console.error("Google Form webhook insert failed", error);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, complaint_id: data.id });
}
