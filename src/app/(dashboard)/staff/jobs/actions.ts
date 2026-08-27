"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const requiredNote = z.string().trim().min(1, "A note is required.").max(5000, "The note is too long.");

async function runJobRpc(id: string, rpc: string, parameters: Record<string, unknown>, success: string) {
  await requireRole(["maintenance_staff"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc(rpc, { p_job_id: id, ...parameters });
  if (error) redirect(`/staff/jobs/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin");
  revalidatePath("/admin/jobs");
  revalidatePath("/staff");
  revalidatePath("/staff/tasks");
  revalidatePath("/staff/monitoring");
  revalidatePath(`/staff/jobs/${id}`);
  redirect(`/staff/jobs/${id}?success=${success}`);
}

export async function startJob(id: string) {
  await runJobRpc(id, "start_assigned_job", {}, "started");
}

export async function completeJob(id: string, data: FormData) {
  const result = requiredNote.safeParse(data.get("actionTaken"));
  if (!result.success) redirect(`/staff/jobs/${id}?error=${encodeURIComponent(result.error.issues[0]?.message || "Action taken is required.")}`);
  await runJobRpc(id, "complete_assigned_job", { p_action_taken: result.data }, "completed");
}

export async function monitorJob(id: string, data: FormData) {
  const result = requiredNote.safeParse(data.get("monitoringNote"));
  if (!result.success) redirect(`/staff/jobs/${id}?error=${encodeURIComponent(result.error.issues[0]?.message || "Monitoring note is required.")}`);
  const reviewValue = String(data.get("reviewAt") || "");
  const reviewAt = reviewValue ? new Date(reviewValue) : null;
  if (reviewAt && Number.isNaN(reviewAt.getTime())) redirect(`/staff/jobs/${id}?error=Enter%20a%20valid%20review%20date.`);
  await runJobRpc(id, "monitor_assigned_job", { p_note: result.data, p_review_at: reviewAt?.toISOString() || null }, "monitoring");
}

export async function setPendingMaterial(id: string, data: FormData) {
  const result = requiredNote.safeParse(data.get("materialNote"));
  if (!result.success) redirect(`/staff/jobs/${id}?error=${encodeURIComponent(result.error.issues[0]?.message || "Material note is required.")}`);
  await runJobRpc(id, "set_job_pending_material", { p_note: result.data }, "pending-material");
}

export async function resumeJob(id: string) {
  await runJobRpc(id, "resume_assigned_job", {}, "resumed");
}
