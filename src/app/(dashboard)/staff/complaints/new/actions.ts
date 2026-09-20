"use server";

import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

const detailsSchema = z.object({
  blockId: z.coerce.number().int().positive("Choose a block."),
  area: z.enum(["Corridor", "Balcony", "Lobby", "Common Bathroom", "Staircase", "Drying Area", "Visitor Room", "Utility Room", "Pantry", "Room", "Other"]),
  location: z.string().trim().min(1, "Enter the room or exact location.").max(120),
  defectType: z.enum(["Lighting", "Water Leakage", "Door / Lock", "Plumbing", "Furniture", "Air Conditioning", "Cleaning Issue", "Other"]),
  description: z.string().trim().min(3, "Describe the problem.").max(3000),
  priority: z.enum(["low", "normal", "high", "urgent"]),
});

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Complaint photo upload is not configured.");
  return createSupabaseAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function ownedCleanerComplaint(admin: ReturnType<typeof adminClient>, complaintId: string, userId: string) {
  const { data } = await admin.from("complaints").select("id,complaint_no,source,source_reference").eq("id", complaintId).maybeSingle();
  if (!data || data.source !== "cleaning" || !data.source_reference?.startsWith(`cleaner:${userId}:`)) return null;
  return data;
}

export async function prepareCleanerComplaint(formData: FormData) {
  const actor = await requireRole(["cleaner"]);
  const parsed = detailsSchema.safeParse({
    blockId: formData.get("blockId"),
    area: formData.get("area"),
    location: formData.get("location"),
    defectType: formData.get("defectType"),
    description: formData.get("description"),
    priority: formData.get("priority"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Check the complaint details." };

  try {
    const admin = adminClient();
    const ownershipMarker = `cleaner:${actor.id}:${crypto.randomUUID()}`;
    const { data: complaint, error: insertError } = await admin.from("complaints").insert({
      source: "cleaning",
      source_reference: ownershipMarker,
      block_id: parsed.data.blockId,
      room_no: parsed.data.location,
      complainant_name: actor.full_name,
      reporter_name: actor.full_name,
      category: `${parsed.data.area} · ${parsed.data.defectType}`,
      description: parsed.data.description,
      priority: parsed.data.priority,
    }).select("id,complaint_no").single();
    if (insertError || !complaint) return { error: insertError?.message || "Unable to create the complaint." };

    const path = `complaints/${complaint.id}/${crypto.randomUUID()}.jpg`;
    const { data: signed, error: signError } = await admin.storage.from("checkout-evidence").createSignedUploadUrl(path);
    if (signError || !signed?.token) {
      await admin.from("complaints").delete().eq("id", complaint.id);
      return { error: signError?.message || "Unable to prepare the photo upload." };
    }
    return { complaintId: complaint.id, complaintNo: complaint.complaint_no, path, token: signed.token };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to prepare the complaint." };
  }
}

export async function finalizeCleanerComplaint(complaintId: string, path: string) {
  const actor = await requireRole(["cleaner"]);
  try {
    const admin = adminClient();
    const complaint = await ownedCleanerComplaint(admin, complaintId, actor.id);
    if (!complaint || !path.startsWith(`complaints/${complaintId}/`)) return { error: "Complaint verification failed." };
    const { error } = await admin.from("complaints").update({ photo_url: `storage://checkout-evidence/${path}` }).eq("id", complaintId);
    if (error) return { error: error.message };
    revalidatePath("/admin");
    revalidatePath("/admin/complaints");
    revalidatePath(`/admin/complaints/${complaintId}`);
    return { ok: true, complaintNo: complaint.complaint_no };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to finish the complaint." };
  }
}

export async function cancelCleanerComplaint(complaintId: string, path: string) {
  const actor = await requireRole(["cleaner"]);
  try {
    const admin = adminClient();
    const complaint = await ownedCleanerComplaint(admin, complaintId, actor.id);
    if (!complaint) return;
    if (path.startsWith(`complaints/${complaintId}/`)) await admin.storage.from("checkout-evidence").remove([path]);
    await admin.from("complaints").delete().eq("id", complaintId);
  } catch {
    // Best-effort cleanup after a failed client upload.
  }
}
