"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function parseDefects(value: FormDataEntryValue | null): string[] {
  try {
    const parsed: unknown = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

export async function createCleanerDefectReport(data: FormData) {
  const profile = await requireRole(["cleaner"]);
  const locationType = String(data.get("locationType") || "");
  const blockId = Number(data.get("blockId"));
  const room = String(data.get("room") || "").trim();
  const commonArea = String(data.get("commonArea") || "").trim();
  const priority = String(data.get("priority") || "normal");
  const allowedPriorities = ["low", "normal", "high", "urgent"];
  const fail = (message: string): never => redirect(`/staff/report-defect?error=${encodeURIComponent(message)}`);

  if ((locationType !== "room" && locationType !== "common_area") || !Number.isInteger(blockId) || blockId < 1) fail("Choose the location and block.");
  if (!allowedPriorities.includes(priority)) fail("Choose a valid priority.");

  const location = locationType === "room" ? room : commonArea;
  if (!location) fail(locationType === "room" ? "Room is required." : "Choose the common area.");

  const defects = parseDefects(data.get("defectsJson"));
  if (!defects.length) fail("Add at least one defect.");

  const db = await createClient();
  const { error } = await db.from("complaints").insert({
    source: "cleaning",
    block_id: blockId,
    room_no: location,
    complainant_name: profile.full_name,
    category: locationType === "room" ? "Cleaner Room Report" : "Cleaner Common Area Report",
    description: defects.map((defect, index) => `${index + 1}. ${defect}`).join("\n"),
    priority,
  });
  if (error) fail(error.message);

  revalidatePath("/admin");
  revalidatePath("/admin/complaints");
  redirect("/staff/report-defect?success=Report sent to Admin.");
}
