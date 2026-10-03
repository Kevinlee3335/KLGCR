"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { jobCompletedEmail, sendTransactionalEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import { notifyActiveAdmins } from "@/lib/app-notifications";
import { staffJobReturnTo } from "@/lib/staff-job-return";

const requiredNote = z.string().trim().min(1, "A note is required.").max(5000, "The note is too long.");
const completionPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxCompletionPhotoBytes = 10 * 1024 * 1024;

type CompletionUpload = { name: string; type: string; size: number };
type CompletionResult = { error?: string; returnTo?: string };

function completionPhotoPath(jobId: string, value: FormDataEntryValue) {
  if (typeof value !== "string") return null;
  const match = new RegExp(`^${jobId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/completion/[0-9a-f-]{36}\\.(jpg|png|webp)$`, "i").exec(value);
  return match ? value : null;
}

/**
 * The image is uploaded directly from the phone to Storage using a short-lived
 * signed URL. This avoids sending multi-megabyte camera photos through the
 * Server Action request, which can make Vercel return a blank client error.
 */
export async function prepareCompletionUpload(jobId: string, file: CompletionUpload): Promise<{ error?: string; path?: string; token?: string }> {
  const staff = await requireRole(["maintenance_staff"]);
  if (!completionPhotoTypes.has(file.type) || file.size <= 0 || file.size > maxCompletionPhotoBytes) {
    return { error: "Completion photos must be JPG, PNG, or WEBP files up to 10 MB." };
  }

  const supabase = await createClient();
  const { data: job, error: jobError } = await supabase
    .from("maintenance_jobs")
    .select("id")
    .eq("id", jobId)
    .eq("assigned_to", staff.id)
    .maybeSingle();
  if (jobError || !job) return { error: "This assigned job could not be verified." };

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${jobId}/completion/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage.from("maintenance-evidence").createSignedUploadUrl(path);
  if (error || !data?.token) return { error: error?.message || "Unable to prepare the completion photo upload." };
  return { path, token: data.token };
}

async function saveCompletionPhotoRecords(supabase: Awaited<ReturnType<typeof createClient>>, jobId: string, staffId: string, data: FormData) {
  const paths = data.getAll("completionPhotoPaths").map((value) => completionPhotoPath(jobId, value)).filter((path): path is string => Boolean(path));
  if (!paths.length) throw new Error("Add at least one completion photo before confirming the job.");
  const { error } = await supabase.from("maintenance_job_photos").insert(paths.map((storage_path) => ({ job_id: jobId, storage_path, uploaded_by: staffId })));
  if (error) throw new Error(`Unable to save completion photo: ${error.message}`);
}

async function runJobRpc(id: string, rpc: string, parameters: Record<string, unknown>, success: string, returnValue: unknown) {
  await requireRole(["maintenance_staff"]);
  const from = encodeURIComponent(staffJobReturnTo(returnValue));
  const supabase = await createClient();
  const { error } = await supabase.rpc(rpc, { p_job_id: id, ...parameters });
  if (error) redirect(`/staff/jobs/${id}?from=${from}&error=${encodeURIComponent(error.message)}`);
  // Authenticated dashboard pages are dynamic and read Supabase on navigation.
  // Refresh only the page receiving the redirect instead of invalidating six routes.
  revalidatePath(`/staff/jobs/${id}`);
  redirect(`/staff/jobs/${id}?from=${from}&success=${success}`);
}

export async function startJob(id: string, data: FormData) {
  await runJobRpc(id, "start_assigned_job", {}, "started", data.get("returnTo"));
}

export async function completeJob(id: string, data: FormData) {
  const returnTo = staffJobReturnTo(data.get("returnTo"));
  const result = requiredNote.safeParse(data.get("actionTaken"));
  if (!result.success) return { error: result.error.issues[0]?.message || "Action taken is required." } satisfies CompletionResult;
  const staff = await requireRole(["maintenance_staff"]);
  const supabase = await createClient();
  try {
    await saveCompletionPhotoRecords(supabase, id, staff.id, data);
  } catch (photoError) {
    const message = photoError instanceof Error ? photoError.message : "Unable to save completion photo.";
    return { error: message } satisfies CompletionResult;
  }
  const { error } = await supabase.rpc("complete_assigned_job", { p_job_id: id, p_action_taken: result.data });
  if (error) return { error: error.message } satisfies CompletionResult;

  // Do not keep staff waiting for email and push delivery after the job is safely completed.
  try {
    after(async () => {
      try {
        const { data: job, error: jobLookupError } = await supabase.from("maintenance_jobs")
          .select("id,job_no,room_no,description,completed_at,complaint_id")
          .eq("id", id).maybeSingle();
        if (jobLookupError) console.error("Unable to load completed job for resident email", jobLookupError);
        const { data: complaint, error: complaintLookupError } = job?.complaint_id
          ? await supabase.from("complaints").select("complaint_no,reporter_name,reporter_email,complainant_contact").eq("id", job.complaint_id).maybeSingle()
          : { data: null, error: null };
        if (complaintLookupError) console.error("Unable to load complaint recipient for completed job email", complaintLookupError);
        const reporterEmail = complaint?.reporter_email || (complaint?.complainant_contact?.includes("@") ? complaint.complainant_contact : null);
        if (job && complaint && reporterEmail) {
          try {
            await sendTransactionalEmail(reporterEmail, jobCompletedEmail({ reporterName: complaint.reporter_name, complaintNo: complaint.complaint_no, roomNo: job.room_no, description: job.description, completedAt: job.completed_at || new Date().toISOString() }));
          } catch (emailError) { console.error("Unable to send completed-job email", emailError); }
        }
        if (job) {
          try {
            await notifyActiveAdmins({ type: "job_completed", title: "Maintenance job completed", body: `${job.job_no} for room ${job.room_no} has been completed.`, href: `/admin/jobs/${job.id}`, entityId: job.id });
          } catch (notificationError) { console.error("Unable to notify administrators about completed job", notificationError); }
        }
      } catch (followUpError) {
        console.error("Unable to run completed-job follow-up", followUpError);
      }
    });
  } catch (followUpScheduleError) {
    // Completion is already recorded; a background notification issue must not break the staff screen.
    console.error("Unable to schedule completed-job follow-up", followUpScheduleError);
  }
  revalidatePath(`/staff/jobs/${id}`);
  revalidatePath(`/admin/jobs/${id}`);
  return { returnTo } satisfies CompletionResult;
}

export async function monitorJob(id: string, data: FormData) {
  const result = requiredNote.safeParse(data.get("monitoringNote"));
  if (!result.success) redirect(`/staff/jobs/${id}?from=${encodeURIComponent(staffJobReturnTo(data.get("returnTo")))}&error=${encodeURIComponent(result.error.issues[0]?.message || "Monitoring note is required.")}`);
  const reviewValue = String(data.get("reviewAt") || "");
  const reviewAt = reviewValue ? new Date(reviewValue) : null;
  if (reviewAt && Number.isNaN(reviewAt.getTime())) redirect(`/staff/jobs/${id}?from=${encodeURIComponent(staffJobReturnTo(data.get("returnTo")))}&error=Enter%20a%20valid%20review%20date.`);
  await runJobRpc(id, "monitor_assigned_job", { p_note: result.data, p_review_at: reviewAt?.toISOString() || null }, "monitoring", data.get("returnTo"));
}

export async function setPendingMaterial(id: string, data: FormData) {
  const result = requiredNote.safeParse(data.get("materialNote"));
  if (!result.success) redirect(`/staff/jobs/${id}?from=${encodeURIComponent(staffJobReturnTo(data.get("returnTo")))}&error=${encodeURIComponent(result.error.issues[0]?.message || "Material note is required.")}`);
  await runJobRpc(id, "set_job_pending_material", { p_note: result.data }, "pending-material", data.get("returnTo"));
}

export async function resumeJob(id: string, data: FormData) {
  await runJobRpc(id, "resume_assigned_job", {}, "resumed", data.get("returnTo"));
}

export async function markTenantNotAvailable(id: string, data: FormData) {
  await requireRole(["maintenance_staff"]);
  const from = encodeURIComponent(staffJobReturnTo(data.get("returnTo")));
  const remarks = z.string().trim().max(1000, "Remarks are too long.").safeParse(data.get("remarks") || "");
  if (!remarks.success) redirect(`/staff/jobs/${id}?from=${from}&error=${encodeURIComponent(remarks.error.issues[0]?.message || "Invalid remarks")}`);
  const supabase = await createClient();
  const { data: attendance, error } = await supabase.rpc("mark_tenant_not_available", { p_job_id: id, p_remarks: remarks.data || null });
  if (error) redirect(`/staff/jobs/${id}?from=${from}&error=${encodeURIComponent(error.message)}`);

  const result = Array.isArray(attendance) ? attendance[0] : attendance;
  // Record attendance first; notification and email are sent after the staff response.
  after(async () => {
    try {
      await notifyActiveAdmins({ type: "tenant_not_available", title: "Tenant not available", body: `Maintenance attended job ${id}, but the tenant was not available.`, href: `/admin/jobs/${id}`, entityId: id });
    } catch (notificationError) {
      console.error("Unable to notify administrators about tenant availability", notificationError);
    }
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
  });
  revalidatePath(`/staff/jobs/${id}`);
  revalidatePath(`/admin/jobs/${id}`);
  redirect(`/staff/jobs/${id}?from=${from}&success=tenant-not-available`);
}
