"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function prepareAdminDailyTaskEvidence(taskId: number, photoCount: number) {
  await requireRole(["admin"]);
  if (!Number.isSafeInteger(taskId) || taskId < 1 || !Number.isInteger(photoCount) || photoCount < 1 || photoCount > 6) return { error: "Attach between 1 and 6 photos." };
  const db = await createClient();
  const { data: task, error } = await db.from("admin_daily_tasks").select("id").eq("id", taskId).maybeSingle();
  if (error || !task) return { error: error?.message || "Daily task not found." };
  // Admin uploads are authorized above; existing storage policy permits only
  // staff assignees. Keep the privileged client exclusively on the server.
  const storage = createAdminClient().storage.from("checkout-evidence");
  const uploads = [];
  for (let index = 0; index < photoCount; index += 1) {
    const path = `daily-tasks/${taskId}/${crypto.randomUUID()}.jpg`;
    const { data, error: uploadError } = await storage.createSignedUploadUrl(path);
    if (uploadError || !data) return { error: uploadError?.message || "Unable to prepare photo upload." };
    uploads.push({ path, token: data.token });
  }
  return { uploads };
}

export async function completeAdminDailyTask(taskId: number, comment: string, paths: string[]) {
  const profile = await requireRole(["admin"]);
  if (!Number.isSafeInteger(taskId) || taskId < 1 || !Array.isArray(paths) || paths.length < 1 || paths.length > 6 || new Set(paths).size !== paths.length || paths.some((path) => typeof path !== "string" || !new RegExp(`^daily-tasks/${taskId}/[0-9a-f-]+\\.jpg$`).test(path))) return { error: "Invalid completion photos." };
  const db = await createClient();
  const { data: task, error: taskError } = await db.from("admin_daily_tasks").select("id").eq("id", taskId).maybeSingle();
  if (taskError || !task) return { error: taskError?.message || "Daily task not found." };
  const adminDb = createAdminClient();
  for (const path of paths) {
    const { data, error } = await adminDb.storage.from("checkout-evidence").list(`daily-tasks/${taskId}`, { search: path.split("/").pop()!, limit: 2 });
    if (error || !data?.some((file) => file.name === path.split("/").pop() && Number(file.metadata?.size) > 0)) return { error: "Completion photo upload is incomplete. Try again." };
  }
  const { data: photos, error: photoError } = await adminDb.from("daily_task_photos").insert(paths.map((path) => ({ task_id: taskId, storage_path: path, uploaded_by: profile.id }))).select("id");
  if (photoError) return { error: photoError.message };
  // Record photos before status, so a failed photo save cannot complete a task.
  const { error } = await db.rpc("admin_update_daily_task", { p_id: taskId, p_status: "completed", p_comment: comment.trim().slice(0, 1000) || null });
  if (error) {
    await adminDb.from("daily_task_photos").delete().in("id", (photos || []).map((photo) => photo.id));
    return { error: error.message };
  }
  revalidatePath("/admin/daily-tasks");
  revalidatePath("/admin/daily-tasks/photos");
  revalidatePath("/staff");
  revalidatePath("/staff/daily-tasks");
  revalidatePath(`/staff/daily-tasks/${taskId}`);
  return { ok: true };
}
