"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  locationType: z.enum(["room", "common_area"]),
  blockId: z.coerce.number().int().positive(),
  room: z.string().trim().optional(),
  commonArea: z.string().trim().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
});

function defectsFrom(data: FormData) {
  try {
    const parsed = JSON.parse(String(data.get("defectsJson") || "[]"));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

export async function createCleanerDefectReport(data: FormData) {
  const profile = await requireRole(["cleaner"]);
  const parsed = schema.safeParse({
    locationType: data.get("locationType"),
    blockId: data.get("blockId"),
    room: data.get("room"),
    commonArea: data.get("commonArea"),
    priority: data.get("priority"),
  });
  const errorPath = (message: string) => redirect(`/staff/report-defect?error=${encodeURIComponent(message)}`);
  if (!parsed.success) errorPath(parsed.error.issues[0]?.message || "Complete the report fields.");
  const defects = defectsFrom(data);
  if (!defects.length) errorPath("Add at least one defect.");

  const location = parsed.data.locationType === "room"
    ? parsed.data.room || ""
    : parsed.data.commonArea || "";
  if (!location) errorPath(parsed.data.locationType === "room" ? "Room is required." : "Choose the common area.");

  const db = await createClient();
  const { error } = await db.from("complaints").insert({
    source: "cleaning",
    block_id: parsed.data.blockId,
    room_no: location,
    complainant_name: profile.full_name,
    category: parsed.data.locationType === "room" ? "Cleaner Room Report" : "Cleaner Common Area Report",
    description: defects.map((defect, index) => `${index + 1}. ${defect}`).join("\n"),
    priority: parsed.data.priority,
  });
  if (error) errorPath(error.message);

  revalidatePath("/admin");
  revalidatePath("/admin/complaints");
  redirect("/staff/report-defect?success=Report sent to Admin.");
}
