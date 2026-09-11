"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { maintenanceBlockCodes, type MaintenanceAssignment } from "@/lib/maintenance-assignments";
import { createClient } from "@/lib/supabase/server";

export type MaintenanceAssignmentState = { ok?: string; error?: string };

const staffIdSchema = z.string().uuid();
const blockSchema = z.enum(maintenanceBlockCodes);

export async function saveMaintenanceAssignments(
  _previous: MaintenanceAssignmentState,
  formData: FormData,
): Promise<MaintenanceAssignmentState> {
  await requireRole(["admin"]);
  const submittedIds = formData.getAll("staffIds").map(String);
  const parsedIds = z.array(staffIdSchema).min(1).safeParse(submittedIds);
  if (!parsedIds.success || new Set(submittedIds).size !== submittedIds.length) return { error: "Invalid maintenance staff selection." };

  const db = await createClient();
  const { data: activeStaff, error: staffError } = await db.from("profiles")
    .select("id").eq("role", "maintenance_staff").eq("is_active", true).is("deleted_at", null).order("id");
  if (staffError) return { error: `Unable to verify maintenance staff: ${staffError.message}` };
  const activeIds = (activeStaff || []).map(({ id }) => id).sort();
  const requestedIds = [...parsedIds.data].sort();
  if (activeIds.length !== requestedIds.length || activeIds.some((id, index) => id !== requestedIds[index])) {
    return { error: "The active staff list changed. Refresh the page and try again." };
  }

  const assignments: MaintenanceAssignment[] = [];
  for (const profileId of parsedIds.data) {
    const parsedBlocks = z.array(blockSchema).safeParse(formData.getAll(`blocks:${profileId}`).map(String));
    if (!parsedBlocks.success || new Set(parsedBlocks.data).size !== parsedBlocks.data.length) return { error: "Invalid block selection." };
    assignments.push({ profileId, blocks: parsedBlocks.data });
  }

  const { error } = await db.rpc("replace_maintenance_assignment_blocks", { p_assignments: assignments });
  if (error) return { error: `Unable to save assignment settings: ${error.message}` };
  revalidatePath("/admin/settings");
  revalidatePath("/admin/complaints");
  return { ok: "Maintenance assignment settings saved." };
}
