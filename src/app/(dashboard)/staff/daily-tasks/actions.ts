"use server";

import { notifyDailyTaskCompleted } from "@/lib/daily-task-notifications";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const maxPhotos = 20;

export async function prepareDailyTaskEvidence(taskId: number, photoCount: number) {
  const profile = await requireRole(["maintenance_staff", "cleaner"]);
  if (!Number.isSafeInteger(taskId) || taskId < 1 || !Number.isInteger(photoCount) || photoCount < 1 || photoCount > maxPhotos) {
    return { error: `Attach between 1 and ${maxPhotos} photos.` };
  }

  const db = await createClient();
  const { data: task, error: taskError } = await db
    .from("admin_daily_tasks")
    .select("id")
    .eq("id", taskId)
    .eq("assigned_to", profile.id)
    .maybeSingle();
  if (taskError || !task) return { error: taskError?.message || "Daily task not found." };

  const uploads = await Promise.all(Array.from({ length: photoCount }, async () => {
    const path = `daily-tasks/${taskId}/${crypto.randomUUID()}.jpg`;
    const { data, error } = await db.storage.from("checkout-evidence").createSignedUploadUrl(path);
    return error || !data?.token ? { error: error?.message || "Unable to prepare a photo upload." } : { path, token: data.token };
  }));
  const failed = uploads.find((upload) => "error" in upload);
  if (failed && "error" in failed) return { error: failed.error };
  return { uploads: uploads as Array<{ path: string; token: string }> };
}

export async function completeDailyTask(taskId: number, comment: string, paths: string[]) {
  const profile = await requireRole(["maintenance_staff", "cleaner"]);
  const db = await createClient();
  const { data: task, error: taskError } = await db.from("admin_daily_tasks").select("id,title,status,task_date,task_category").eq("id", taskId).eq("assigned_to", profile.id).maybeSingle();
  if (taskError || !task) return { error: taskError?.message || "Daily task not found." };
  const { error } = await db.rpc("complete_assigned_daily_task", {
    p_id: taskId,
    p_comment: comment.trim() || null,
    p_paths: paths,
  });
  if (error) return { error: error.message };
  try { await notifyDailyTaskCompleted(task, profile.full_name); }
  catch (notificationError) { console.error("Unable to notify daily task completion", notificationError); }
  revalidatePath("/staff");
  revalidatePath("/staff/daily-tasks");
  revalidatePath(`/staff/daily-tasks/${taskId}`);
  revalidatePath("/admin/daily-tasks");
  return { ok: true };
}
