"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mapCheckoutPhotos } from "@/lib/checkout-photo-uploads";
import {
  canonicalCheckoutPdfRoom, checkoutPdfRoomSchema,
  type CheckoutPdfRoomInput, type CheckoutPdfUploadedPhoto,
} from "@/lib/checkout-pdf-import";
import { bulkAssignCheckouts } from "./actions";

/** Signed staging uploads do not create a room or an assignment. */
export async function prepareCheckoutPdfRoom(input: CheckoutPdfRoomInput) {
  const actor = await requireRole(["admin"]);
  const validation = checkoutPdfRoomSchema.safeParse(input);
  if (!validation.success) return { error: validation.error.issues[0]?.message || "Check the PDF room details." };
  const room = validation.data;
  const db = await createClient();
  const { data: block, error: blockError } = await db.from("blocks").select("id,code")
    .eq("id", room.blockId).eq("code", room.blockCode).maybeSingle();
  if (blockError || !block) return { error: blockError?.message || "Select the matching Block A or B." };

  const { data: imported, error: sourceError } = await db.from("checkout_defects")
    .select("utmspace_source_key,checkout_room_id").in("utmspace_source_key", room.defects.map(defect => `${room.blockCode}:${room.roomNo}:${defect.sourceId}`));
  if (sourceError) return { error: sourceError.message };
  if (imported?.length) {
    const ids = new Set(imported.map(row => row.checkout_room_id));
    if (imported.length !== room.defects.length || ids.size !== 1) {
      return { error: "Some of these UTMSPACE references were imported before. Review the existing records before adding this room." };
    }
    return { skipped: true as const, roomId: imported[0].checkout_room_id as string,
      reason: "These UTMSPACE defects were already imported; the existing record was retained." };
  }
  const { data: current, error: roomError } = await db.from("checkout_rooms").select("id,room_no")
    .eq("block_id", room.blockId).is("deleted_at", null).is("batch_archived_at", null);
  if (roomError) return { error: roomError.message };
  const existing = current?.find(row => canonicalCheckoutPdfRoom(row.room_no, room.blockCode) === room.roomNo);
  if (existing) return { skipped: true as const, roomId: existing.id as string,
    reason: "This room already has a record in the current batch. Its saved defects and progress were retained." };

  const importId = crypto.randomUUID();
  const photos = room.defects.flatMap(defect => defect.photos.map((photo, photoIndex) => ({ ...photo, sourceId: defect.sourceId, photoIndex })));
  try {
    const bucket = db.storage.from("checkout-evidence");
    const uploads = await mapCheckoutPhotos(photos, 4, async photo => {
      const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
      const path = `pdf-import/${actor.id}/${importId}/${crypto.randomUUID()}.${extension}`;
      const { data, error } = await bucket.createSignedUploadUrl(path);
      if (error || !data?.token) throw new Error(error?.message || "Unable to prepare PDF photo uploads.");
      return { path, token: data.token, sourceId: photo.sourceId, photoIndex: photo.photoIndex };
    });
    return { importId, uploads };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Unable to prepare PDF photo uploads." };
  }
}

/** One database transaction saves the room, all its defects and its verified evidence. */
export async function finishCheckoutPdfRoom(input: CheckoutPdfRoomInput, importId: string, paths: CheckoutPdfUploadedPhoto[]) {
  const actor = await requireRole(["admin"]);
  const validation = checkoutPdfRoomSchema.safeParse(input);
  if (!validation.success) return { error: validation.error.issues[0]?.message || "Check the PDF room details." };
  if (typeof importId !== "string" || !/^[0-9a-f-]{36}$/i.test(importId) || !Array.isArray(paths)
    || paths.some(photo => !photo || typeof photo !== "object" || typeof photo.path !== "string"
      || typeof photo.sourceId !== "string" || !Number.isInteger(photo.photoIndex) || photo.photoIndex < 0)) {
    return { error: "Invalid PDF import. Please try again." };
  }
  const expected = validation.data.defects.flatMap(defect => defect.photos.map((_, photoIndex) => `${defect.sourceId}:${photoIndex}`));
  const prefix = `pdf-import/${actor.id}/${importId}/`;
  if (paths.length !== expected.length || new Set(paths.map(photo => photo.path)).size !== paths.length
    || new Set(paths.map(photo => `${photo.sourceId}:${photo.photoIndex}`)).size !== paths.length
    || paths.some(photo => !photo || typeof photo.path !== "string" || !photo.path.startsWith(prefix)
      || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(photo.path.slice(prefix.length))
      || !expected.includes(`${photo.sourceId}:${photo.photoIndex}`))) {
    return { error: "All PDF photos must finish uploading to their matching defect before this room is saved." };
  }
  const db = await createClient();
  const { data, error } = await db.rpc("import_checkout_pdf_room", {
    p_room: validation.data, p_import_id: importId, p_photos: paths,
  });
  if (error) return { error: error.message };
  if (!data || typeof data.roomId !== "string" || typeof data.created !== "boolean") {
    return { error: "The import result could not be confirmed. Retry to check the saved UTMSPACE references." };
  }
  revalidatePath("/admin/checkouts");
  revalidatePath(`/admin/checkouts/${data.roomId}`);
  return { created: data.created as boolean, roomId: data.roomId as string, reason: data.reason as string | undefined };
}

export async function assignImportedCheckout(id: string, form: FormData) {
  await requireRole(["admin"]);
  const db = await createClient();
  const { data: room } = await db.from("checkout_rooms").select("id,utmspace_pdf_source")
    .eq("id", id).is("deleted_at", null).eq("status", "second_inspection").maybeSingle();
  if (!room?.utmspace_pdf_source) redirect(`/admin/checkouts/${id}?error=This+PDF+room+is+no+longer+awaiting+assignment`);
  const result = await bulkAssignCheckouts([id], String(form.get("assignee") || ""), "maintenance");
  if ("error" in result || !result.count) {
    redirect(`/admin/checkouts/${id}?error=${encodeURIComponent("error" in result ? result.error || "Unable to assign maintenance." : "The room is no longer awaiting assignment.")}`);
  }
  revalidatePath(`/admin/checkouts/${id}`);
  redirect(`/admin/checkouts/${id}`);
}
