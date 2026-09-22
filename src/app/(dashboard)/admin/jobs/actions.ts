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
