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
  // Authenticated dashboard pages are dynamic and read Supabase on navigation.
  // Refresh only the page receiving the redirect instead of invalidating six routes.
  revalidatePath(`/staff/jobs/${id}`);
  redirect(`/staff/jobs/${id}?success=${success}`);
}

export async function startJob(id: string) {
  await runJobRpc(id, "start_assigned_job", {}, "started");
}

export async function completeJob(id: string, data: FormData) {
  const result = requiredNote.safeParse(data.get("actionTaken"));
  if (!result.success) redirect(`/staff/jobs/${id}?error=${encodeURIComponent(result.error.issues[0]?.message || "Action taken is required.")}`);
  const files = data.getAll("completionPhoto").filter((value): value is File => value instanceof File && value.size > 0);
  const photo = files[0];
  if (!photo) redirect(`/staff/jobs/${id}?error=${encodeURIComponent("A completion photo is required.")}`);
  if (photo.size > 10 * 1024 * 1024) redirect(`/staff/jobs/${id}?error=${encodeURIComponent("Completion photo must be 10 MB or smaller.")}`);
  if (!photo.type.startsWith("image/")) redirect(`/staff/jobs/${id}?error=${encodeURIComponent("Completion evidence must be an image.")}`);

  const profile = await requireRole(["maintenance_staff"]);
  const supabase = await createClient();
  const extension = photo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const storagePath = `${id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("maintenance-evidence").upload(storagePath, photo, { contentType: photo.type, upsert: false });
  if (uploadError) redirect(`/staff/jobs/${id}?error=${encodeURIComponent(`Photo upload failed: ${uploadError.message}`)}`);
  const { error: evidenceError } = await supabase.from("maintenance_job_photos").insert({ job_id: id, storage_path: storagePath, uploaded_by: profile.id });
  if (evidenceError) {
    await supabase.storage.from("maintenance-evidence").remove([storagePath]);
    redirect(`/staff/jobs/${id}?error=${encodeURIComponent(`Photo record failed: ${evidenceError.message}`)}`);
  }
  const { error } = await supabase.rpc("complete_assigned_job", { p_job_id: id, p_action_taken: result.data });
  if (error) redirect(`/staff/jobs/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/staff/jobs/${id}`);
  redirect(`/staff/jobs/${id}?success=completed`);
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

export async function markTenantNotAvailable(id: string, data: FormData) {
  await requireRole(["maintenance_staff"]);
  const remarks = z.string().trim().max(1000, "Remarks are too long.").safeParse(data.get("remarks") || "");
  if (!remarks.success) redirect(`/staff/jobs/${id}?error=${encodeURIComponent(remarks.error.issues[0]?.message || "Invalid remarks")}`);
  const supabase = await createClient();
  const { data: attendance, error } = await supabase.rpc("mark_tenant_not_available", { p_job_id: id, p_remarks: remarks.data || null });
  if (error) redirect(`/staff/jobs/${id}?error=${encodeURIComponent(error.message)}`);

  const result = Array.isArray(attendance) ? attendance[0] : attendance;
  if (result?.complaint_id) {
    const { data: complaint } = await supabase.from("complaints")
      .select("complaint_no,room_no,description,reporter_name,reporter_email")
      .eq("id", result.complaint_id).maybeSingle();
    if (complaint) {
      const { tenantNotAvailableEmail, sendTransactionalEmail } = await import("@/lib/email");
      await sendTransactionalEmail(complaint.reporter_email, tenantNotAvailableEmail({
        reporterName: complaint.reporter_name, complaintNo: complaint.complaint_no,
        roomNo: complaint.room_no, description: complaint.description,
        appointmentDate: result.appointment_date, appointmentTime: result.appointment_time,
        attendedAt: result.attended_at,
      }));
    }
  }
  revalidatePath(`/staff/jobs/${id}`);
  revalidatePath(`/admin/jobs/${id}`);
  redirect(`/staff/jobs/${id}?success=tenant-not-available`);
}
