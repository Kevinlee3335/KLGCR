"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const go = (id: string, error?: string) => redirect(`/staff/checkouts/${id}${error ? `?error=${encodeURIComponent(error)}` : ""}`);

function parseDefects(value: FormDataEntryValue | null) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

async function photo(db: Awaited<ReturnType<typeof createClient>>, id: string, user: string, file: File, kind: "completion" | "cleaning") {
  if (!file.size) throw new Error("Upload at least one completion photo.");
  if (file.size > 10485760 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use a JPG, PNG or WebP photo up to 10 MB.");
  const path = `${id}/${kind}/${crypto.randomUUID()}.${file.name.split(".").pop() || "jpg"}`;
  const up = await db.storage.from("checkout-evidence").upload(path, file, { contentType: file.type });
  if (up.error) throw up.error;
  const row = await db.from("checkout_photos").insert({ checkout_room_id: id, kind, storage_path: path, uploaded_by: user });
  if (row.error) throw row.error;
}

export async function updateCheckoutDefectStatus(checkoutId: string, defectId: string, data: FormData) {
  const actor = await requireRole(["maintenance_staff"]);
  const status = String(data.get("status") || "");
  if (status !== "open" && status !== "rectified") go(checkoutId, "Choose In Progress or Completed.");
  const db = await createClient();
  const update = await db.from("checkout_defects").update({
    status,
    rectified_by: status === "rectified" ? actor.id : null,
    rectified_at: status === "rectified" ? new Date().toISOString() : null,
  }).eq("id", defectId).eq("checkout_room_id", checkoutId);
  if (update.error) go(checkoutId, update.error.message);
  await db.from("checkout_history").insert({
    checkout_room_id: checkoutId, actor_id: actor.id, action: "defect_status_updated",
    notes: status === "rectified" ? "Defect marked Completed" : "Defect returned to In Progress",
  });
  revalidatePath(`/staff/checkouts/${checkoutId}`);
  go(checkoutId);
}

export async function reportCleaningDefects(id: string, data: FormData) {
  const actor = await requireRole(["cleaner"]);
  const defects = parseDefects(data.get("cleanerDefectsJson"));
  if (!defects.length) go(id, "Add at least one defect to report.");
  const db = await createClient();
  const room = await db.from("checkout_rooms").select("id").eq("id", id).eq("cleaner_id", actor.id).eq("status", "cleaning").maybeSingle();
  if (room.error || !room.data) go(id, room.error?.message || "This room is not assigned to you for cleaning.");
  const insert = await db.from("checkout_defects").insert(defects.map((description) => ({
    checkout_room_id: id, description, source: "cleaner", created_by: actor.id,
  })));
  if (insert.error) go(id, insert.error.message);
  await db.from("checkout_history").insert({
    checkout_room_id: id, actor_id: actor.id, action: "cleaner_defects_reported",
    notes: `${defects.length} new defect${defects.length === 1 ? "" : "s"} reported to Admin during cleaning.`,
  });
  revalidatePath(`/staff/checkouts/${id}`);
  go(id);
}

export async function completeRectification(id: string, data: FormData) {
  const actor = await requireRole(["maintenance_staff"]);
  const db = await createClient();
  const { count, error: countError } = await db.from("checkout_defects").select("id", { count: "exact", head: true }).eq("checkout_room_id", id).eq("status", "open");
  if (countError) go(id, countError.message);
  if ((count || 0) > 0) go(id, "Complete every Defect before completing rectification.");
  try { await photo(db, id, actor.id, data.get("photo") as File, "completion"); } catch (error) { go(id, error instanceof Error ? error.message : "Upload failed"); }
  const update = await db.from("checkout_rooms").update({ status: "verification" }).eq("id", id).eq("assigned_to", actor.id).eq("status", "rectification");
  if (update.error) go(id, update.error.message);
  await db.from("checkout_history").insert({
    checkout_room_id: id, actor_id: actor.id, action: "rectification_completed",
    notes: String(data.get("notes") || "") || null, from_status: "rectification", to_status: "verification",
  });
  revalidatePath(`/staff/checkouts/${id}`);
  go(id);
}

async function completeCleaningRooms(ids: string[], actorId: string, db: Awaited<ReturnType<typeof createClient>>) {
  const { data: rooms, error } = await db.from("checkout_rooms").select("id").in("id", ids).eq("cleaner_id", actorId).eq("status", "cleaning");
  if (error) throw error;
  const allowedIds = (rooms || []).map((room) => room.id);
  if (!allowedIds.length) throw new Error("No selected rooms are ready for cleaning completion.");
  const update = await db.from("checkout_rooms").update({ status: "verification" }).in("id", allowedIds).eq("cleaner_id", actorId).eq("status", "cleaning");
  if (update.error) throw update.error;
  const history = await db.from("checkout_history").insert(allowedIds.map((checkout_room_id) => ({
    checkout_room_id, actor_id: actorId, action: "cleaning_completed", from_status: "cleaning", to_status: "verification",
  })));
  if (history.error) throw history.error;
  return allowedIds.length;
}

export async function completeCleaning(id: string, _data: FormData) {
  const actor = await requireRole(["cleaner"]);
  const db = await createClient();
  try { await completeCleaningRooms([id], actor.id, db); } catch (error) { go(id, error instanceof Error ? error.message : "Could not complete cleaning."); }
  revalidatePath("/staff/checkouts");
  revalidatePath(`/staff/checkouts/${id}`);
  go(id);
}

export async function completeSelectedCleaning(data: FormData) {
  const actor = await requireRole(["cleaner"]);
  const ids = Array.from(new Set(data.getAll("checkoutIds").map(String).filter(Boolean)));
  if (!ids.length) redirect("/staff/checkouts?error=Select at least one room.");
  const db = await createClient();
  try { await completeCleaningRooms(ids, actor.id, db); } catch (error) { redirect(`/staff/checkouts?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not complete rooms.")}`); }
  revalidatePath("/staff/checkouts");
  redirect("/staff/checkouts?success=Selected rooms sent to Admin verification.");
}
