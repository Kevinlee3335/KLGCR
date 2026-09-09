import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formValue, roomAccessPermission, toDatabaseTime, toIsoDate, type GoogleFormPayload } from "@/lib/google-form";

export const runtime = "nodejs";

type FormPayload = GoogleFormPayload;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function toIsoTimestamp(value: string) {
  if (!value) return new Date().toISOString();

  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (match) {
    const [, month, day, year, hour, minute, second] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:${second}+08:00`;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-klgcr-form-secret");
  if (!process.env.GOOGLE_FORM_WEBHOOK_SECRET || secret !== process.env.GOOGLE_FORM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: FormPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const block = formValue(body, "BLOCK");
  const room = formValue(body, "ROOM NUMBER / COMMON AREA");
  const description = formValue(body, "REPORT DESCRIPTION");
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

  if (blockError || !blockRow) {
    return NextResponse.json({ error: "Unknown block" }, { status: 400 });
  }

  const reporterName = formValue(body, "NAME");
  const reporterPhone = formValue(body, "PHONE NUMBER (WHATSAPP)");
  const reporterEmail = formValue(body, "EMAIL ADDRESS", "Email Address");
  const timestamp = formValue(body, "Timestamp");
  const availabilityDate = toIsoDate(formValue(body, "Room Availability Date", "ROOM AVAILABILITY (DATE)"));
  const availabilityTime = toDatabaseTime(formValue(body, "Room Availability Time", "ROOM AVAILABILITY (TIME)"));
  const accessRequest = formValue(body, "Request For Room Access Due To Tenant's Unavailability", "REQUEST FOR ROOM ACCESS DUE TO TENANT'S UNAVAILABILITY");
  const accessPermission = roomAccessPermission(accessRequest);
  if (!availabilityDate || !availabilityTime || !accessPermission) {
    return NextResponse.json({ error: "Missing or invalid room availability/access fields" }, { status: 400 });
  }

  const payload = {
    block_id: blockRow.id,
    room_no: room,
    category: formValue(body, "MAINTENANCE TYPE") || "General",
    description,
    photo_url: formValue(body, "PHOTO (IF APPLICABLE)") || null,
    status: "new",
    source: "google_form",
    source_reference: sourceReference,
    complainant_name: reporterName || null,
    complainant_contact: reporterPhone || reporterEmail || null,
    reporter_name: reporterName || null,
    reporter_phone: reporterPhone || null,
    reporter_email: reporterEmail || null,
    availability_date: availabilityDate,
    availability_time: availabilityTime,
    preferred_date: availabilityDate,
    preferred_time: availabilityTime,
    // Store the Google Form answer explicitly. YES grants access and therefore
    // needs no appointment; NO requires an admin-scheduled appointment.
    room_access_permission: accessPermission,
    appointment_required: accessPermission === "no",
    need_appointment: accessPermission === "no",
    submitted_at: toIsoTimestamp(timestamp),
  };

  const { data, error } = await supabase.from("complaints").insert(payload).select("id").single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    console.error("Google Form webhook insert failed", error);
    return NextResponse.json({ error: "Insert failed", code: error.code, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, complaint_id: data.id });
}
