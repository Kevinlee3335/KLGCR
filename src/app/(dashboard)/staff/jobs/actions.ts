"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { jobCompletedEmail, sendTransactionalEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
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
  await requireRole(["maintenance_staff"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_assigned_job", { p_job_id: id, p_action_taken: result.data });
  if (error) redirect(`/staff/jobs/${id}?error=${encodeURIComponent(error.message)}`);

  const { data: job } = await supabase.from("maintenance_jobs")
    .select("id,job_no,room_no,description,completed_at,complaint:complaints!maintenance_jobs_complaint_id_fkey(complaint_no,reporter_name,reporter_email)")
    .eq("id", id).maybeSingle();
  const complaint = Array.isArray(job?.complaint) ? job?.complaint[0] : job?.complaint;
  if (job && complaint?.reporter_email) {
    const admin = createAdminClient();
    const { data: feedback, error: feedbackError } = await admin.from("maintenance_job_feedback")
      .upsert({ job_id: job.id, reporter_email: complaint.reporter_email }, { onConflict: "job_id" })
      .select("token").single();
    if (feedbackError) console.error("Unable to create resident feedback request", feedbackError);
    if (feedback?.token) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://klgcr-maintenance-system.vercel.app";
      await sendTransactionalEmail(complaint.reporter_email, jobCompletedEmail({
        reporterName: complaint.reporter_name,
        complaintNo: complaint.complaint_no,
        roomNo: job.room_no,
        description: job.description,
        completedAt: job.completed_at || new Date().toISOString(),
        ratingUrl: `${appUrl}/feedback/${feedback.token}`,
      }));
    }
  }
  revalidatePath(`/staff/jobs/${id}`);
  revalidatePath(`/admin/jobs/${id}`);
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
