"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { notifyActiveAdmins } from "@/lib/app-notifications";
import { createClient } from "@/lib/supabase/server";

const detailsSchema = z.object({
  locationType: z.enum(["room", "bathroom", "common", "external"]),
  blockId: z.coerce.number().int().positive().optional(),
  area: z.string().trim().min(1, "Choose an area."),
  location: z.string().trim().max(120),
  defectType: z.string().trim().min(1, "Choose a defect item.").max(100),
  description: z.string().trim().max(3000),
  priority: z.enum(["low", "normal", "high", "urgent"]),
}).superRefine((details, context) => {
  if (details.locationType !== "external" && !details.blockId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["blockId"], message: "Choose a block." });
  }
  if (["room", "bathroom"].includes(details.locationType) && !details.location) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["location"], message: "Enter the room or bathroom location." });
  }
  if ((details.area === "Other" || details.defectType === "Other") && !details.description) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["description"], message: "Describe the Other problem." });
  }
});

export async function prepareCleanerComplaint(formData: FormData) {
  await requireRole(["cleaner"]);
  const parsed = detailsSchema.safeParse({
    locationType: formData.get("locationType"),
    blockId: formData.get("blockId"),
    area: formData.get("area"),
    location: formData.get("location"),
    defectType: formData.get("defectType"),
    description: formData.get("description"),
    priority: formData.get("priority"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Check the complaint details." };

  try {
    const supabase = await createClient();
    const roomNo = `${parsed.data.area}${parsed.data.location ? ` · ${parsed.data.location}` : ""}`;
    const { data: createdComplaint, error: insertError } = await supabase
      .rpc("create_cleaner_complaint", {
        p_block_id: parsed.data.locationType === "external" ? null : parsed.data.blockId ?? null,
        p_room_no: roomNo,
        p_category: `${parsed.data.area} · ${parsed.data.defectType}`,
        p_description: parsed.data.description,
        p_priority: parsed.data.priority,
      })
      .single();
    const complaint = createdComplaint as unknown as { id: string; complaint_no: string } | null;
    if (insertError || !complaint) return { error: insertError?.message || "Unable to create the complaint." };

    const path = `complaints/${complaint.id}/${crypto.randomUUID()}.jpg`;
    const { data: signed, error: signError } = await supabase.storage.from("checkout-evidence").createSignedUploadUrl(path);
    if (signError || !signed?.token) {
      await supabase.from("complaints").delete().eq("id", complaint.id);
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
    const supabase = await createClient();
    const { data: complaintNo, error } = await supabase.rpc("finalize_cleaner_complaint", { p_complaint_id: complaintId, p_path: path });
    if (error || !complaintNo) return { error: error?.message || "Complaint verification failed." };
    try {
      await notifyActiveAdmins({ type: "complaint_created", title: "New cleaner report", body: `${actor.full_name} submitted complaint ${complaintNo}.`, href: `/admin/complaints/${complaintId}`, entityId: complaintId });
    } catch (notificationError) {
      console.error("Unable to notify administrators about cleaner report", notificationError);
    }
    revalidatePath("/admin");
    revalidatePath("/admin/complaints");
    revalidatePath(`/admin/complaints/${complaintId}`);
    return { ok: true, complaintNo };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to finish the complaint." };
  }
}

export async function cancelCleanerComplaint(complaintId: string, path: string) {
  await requireRole(["cleaner"]);
  try {
    const supabase = await createClient();
    if (path.startsWith(`complaints/${complaintId}/`)) await supabase.storage.from("checkout-evidence").remove([path]);
    await supabase.from("complaints").delete().eq("id", complaintId);
  } catch {
    // Best-effort cleanup after a failed client upload.
  }
}
