import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type IncomingDefect = {
  category?: unknown;
  description?: unknown;
  quantity?: unknown;
  remarks?: unknown;
};

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function defectDescription(defect: IncomingDefect) {
  const description = text(defect.description, 180);
  const category = text(defect.category, 80);
  const remarks = text(defect.remarks, 500);
  const quantity = Number(defect.quantity);
  if (!description || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return null;
  return `[Handover] ${description} · qty ${quantity}${category ? ` · ${category}` : ""}${remarks ? ` · ${remarks}` : ""}`;
}

export async function POST(request: Request) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Sign in as an Admin on this test site before sending defects." }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Only an Admin can send handover defects to Check-out Room." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid handover inspection data." }, { status: 400 });
  }

  const blockCode = text(body.blockCode, 1).toUpperCase();
  const roomNo = text(body.roomNo, 80);
  const level = text(body.level, 8);
  const round = Number(body.round);
  const inspectionDate = text(body.inspectionDate, 10);
  const reason = text(body.reason, 120);
  const incoming = Array.isArray(body.defects) ? body.defects.slice(0, 50) : [];
  const descriptions = [...new Set(incoming.map((row) => defectDescription(row as IncomingDefect)).filter((row): row is string => Boolean(row)))];

  if (!['C', 'D'].includes(blockCode) || !roomNo || !Number.isInteger(round) || round < 1 || !inspectionDate || !descriptions.length) {
    return NextResponse.json({ error: "Block, room, round, inspection date, and at least one valid defect are required." }, { status: 400 });
  }

  const db = await createClient();
  const { data: block, error: blockError } = await db.from("blocks").select("id").eq("code", blockCode).single();
  if (blockError || !block) return NextResponse.json({ error: "The selected block was not found." }, { status: 400 });

  const { data: matches, error: roomLookupError } = await db
    .from("checkout_rooms")
    .select("id,status")
    .eq("block_id", block.id)
    .eq("room_no", roomNo)
    .order("created_at", { ascending: false })
    .limit(1);
  if (roomLookupError) return NextResponse.json({ error: roomLookupError.message }, { status: 500 });

  let checkoutRoomId = matches?.[0]?.id;
  let createdRoom = false;
  if (checkoutRoomId && matches?.[0]?.status === "ready_for_occupancy") {
    return NextResponse.json({ error: "This room is already marked Ready for Occupancy. Start a new Check-out Room record before importing another handover." }, { status: 409 });
  }

  if (!checkoutRoomId) {
    const summary = `Handover inspection · Level ${level || "-"} · Round ${round}\n${descriptions.join("\n")}`.slice(0, 10000);
    const { data: created, error: createError } = await db
      .from("checkout_rooms")
      .insert({ block_id: block.id, room_no: roomNo, utmspace_defects: summary, created_by: profile.id })
      .select("id")
      .single();
    if (createError || !created) return NextResponse.json({ error: createError?.message || "Unable to create the Check-out Room record." }, { status: 500 });
    checkoutRoomId = created.id;
    createdRoom = true;
  }

  const { data: existing, error: existingError } = await db
    .from("checkout_defects")
    .select("description,status")
    .eq("checkout_room_id", checkoutRoomId);
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  const openDescriptions = new Set((existing || []).filter((row) => row.status === "open").map((row) => row.description.trim().toLowerCase()));
  const newDescriptions = descriptions.filter((description) => !openDescriptions.has(description.toLowerCase()));
  if (newDescriptions.length) {
    const { error: defectError } = await db.from("checkout_defects").insert(
      newDescriptions.map((description) => ({ checkout_room_id: checkoutRoomId, description, source: "second_inspection", created_by: profile.id })),
    );
    if (defectError) return NextResponse.json({ error: defectError.message }, { status: 500 });
    const notes = `Handover inspection · ${inspectionDate} · Round ${round}${reason ? ` · ${reason}` : ""} · ${newDescriptions.length} defect(s) imported.`;
    const { error: historyError } = await db.from("checkout_history").insert({ checkout_room_id: checkoutRoomId, actor_id: profile.id, action: createdRoom ? "record_created_from_handover" : "handover_defects_imported", notes, from_status: null, to_status: createdRoom ? "second_inspection" : null });
    if (historyError) return NextResponse.json({ error: historyError.message }, { status: 500 });
  }

  revalidatePath("/admin/checkouts");
  revalidatePath(`/admin/checkouts/${checkoutRoomId}`);
  return NextResponse.json({ checkoutRoomId, createdRoom, createdDefects: newDescriptions.length, checkoutUrl: `/admin/checkouts/${checkoutRoomId}` });
}
