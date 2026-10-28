"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { appointmentStatuses, appointmentTimeValues } from "@/lib/appointments";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAppNotifications } from "@/lib/app-notifications";

const appointmentSchema = z.object({
  appointmentDate: z.string().date(),
  appointmentTime: z.enum(appointmentTimeValues),
  remarks: z.string().trim().max(1000).optional(),
  status: z.enum(appointmentStatuses).optional(),
});

const destination = (jobId: string, error?: string) =>
  `/admin/jobs/${jobId}?${error ? `error=${encodeURIComponent(error)}` : "appointment=1"}`;

export async function transferJob(jobId: string, data: FormData) {
  await requireRole(["admin"]);
  const staffId = String(data.get("staffId") || "");
  const reason = String(data.get("reason") || "").trim();
  if (!z.string().uuid().safeParse(staffId).success || !reason) redirect(destination(jobId, "Choose an employee and enter the transfer reason."));
  const db = await createClient();
  const {error} = await db.rpc("transfer_maintenance_job", {p_job_id:jobId,p_staff_id:staffId,p_reason:reason});
  if (error) redirect(destination(jobId,error.message));
  try { await createAppNotifications({recipientIds:[staffId],type:"job_assigned",title:"Maintenance job transferred to you",body:reason,href:`/staff/jobs/${jobId}`,entityId:jobId}); }
  catch (error) { console.error("Transfer notification failed",error); }
  revalidatePath("/admin/jobs"); revalidatePath(`/admin/jobs/${jobId}`); revalidatePath("/staff/tasks"); revalidatePath("/staff/calendar");
  redirect(`/admin/jobs/${jobId}`);
}

export async function saveJobAppointment(jobId: string, appointmentId: string | null, data: FormData) {
  const actor = await requireRole(["admin"]);
  const parsed = appointmentSchema.safeParse({
    appointmentDate: data.get("appointmentDate"), appointmentTime: data.get("appointmentTime"),
    remarks: data.get("remarks"), status: data.get("status") || undefined,
  });
  if (!parsed.success) redirect(destination(jobId, parsed.error.issues[0]?.message || "Invalid appointment"));
  const db = await createClient();
  const { data: job, error: jobError } = await db.from("maintenance_jobs").select("complaint_id,assigned_to").eq("id", jobId).maybeSingle();
  if (jobError || !job) redirect(destination(jobId, jobError?.message || "Job not found"));
  const values = { appointment_date: parsed.data.appointmentDate, appointment_time: parsed.data.appointmentTime,
    remarks: parsed.data.remarks || null, ...(parsed.data.status ? { status: parsed.data.status } : {}) };
  const result = appointmentId
    ? await db.from("appointments").update(values).eq("id", appointmentId).eq("job_id", jobId)
    : await db.from("appointments").insert({ ...values, complaint_id: job.complaint_id, job_id: jobId,
        assigned_staff: job.assigned_to, status: "pending_confirmation", created_by: actor.id });
  if (result.error) redirect(destination(jobId, result.error.message));
  try {
    await createAppNotifications({ recipientIds: [job.assigned_to], type: "appointment_updated", title: "Maintenance appointment updated", body: `Your visit is scheduled for ${parsed.data.appointmentDate}, ${parsed.data.appointmentTime}.`, href: `/staff/jobs/${jobId}`, entityId: jobId });
  } catch (notificationError) { console.error("Unable to notify maintenance staff about appointment", notificationError); }
  revalidatePath(`/admin/jobs/${jobId}`); revalidatePath("/admin/daily-tasks"); revalidatePath("/staff"); revalidatePath("/staff/appointments");
  redirect(destination(jobId));
}

export async function followUpMonitoringJob(jobId: string, data: FormData) {
  await requireRole(["admin"]);
  const parsed = z.object({
    outcome: z.enum(["completed", "in_progress", "under_monitoring"]),
    note: z.string().trim().min(1, "Follow-up remarks are required.").max(2000),
    reviewDate: z.union([z.string().date(), z.literal("")]),
  }).safeParse({ outcome: data.get("outcome"), note: data.get("note"), reviewDate: data.get("reviewDate") || "" });
  if (!parsed.success) redirect(destination(jobId, parsed.error.issues[0]?.message || "Invalid follow-up"));
  const { outcome, note, reviewDate } = parsed.data;
  if (outcome === "under_monitoring" && !reviewDate) redirect(destination(jobId, "Choose the next follow-up date."));
  const db = await createClient();
  const { error } = await db.rpc("admin_follow_up_monitoring_job", {
    p_job_id: jobId, p_outcome: outcome, p_note: note,
    p_review_at: outcome === "under_monitoring" ? `${reviewDate}T00:00:00+08:00` : null,
  });
  if (error) redirect(destination(jobId, error.message));
  for (const path of ["/admin", "/admin/jobs", `/admin/jobs/${jobId}`, "/admin/complaints", "/staff", "/staff/tasks", "/staff/monitoring", `/staff/jobs/${jobId}`]) revalidatePath(path);
  redirect(`/admin/jobs/${jobId}?followUp=1`);
}
