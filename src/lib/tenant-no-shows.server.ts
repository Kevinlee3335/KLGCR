import type { createClient } from "@/lib/supabase/server";
import { unresolvedTenantNoShows, type TenantNoShowNotification } from "@/lib/admin-notifications";

type Appointment = TenantNoShowNotification & {
  job: (NonNullable<TenantNoShowNotification["job"]> & { active_appointments: { id: string }[] }) | null;
};

export async function loadTenantNoShows(db: Awaited<ReturnType<typeof createClient>>) {
  const rows: Appointment[] = [];
  const query = db.from("appointments")
    .select("id,job_id,appointment_date,appointment_time,attended_at,no_show_remarks,attendee:profiles!appointments_attended_by_fkey(full_name),job:maintenance_jobs!appointments_job_id_fkey!inner(id,job_no,status,room_no,block:blocks!block_id(code),active_appointments:appointments!appointments_job_id_fkey(id))")
    .eq("status", "no_show").not("job.status", "in", '("completed","cancelled")')
    .in("job.active_appointments.status", ["pending_confirmation", "confirmed"])
    .limit(1, { referencedTable: "job.active_appointments" })
    .order("attended_at", { ascending: false }).order("id");
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999);
    if (error) {
      console.error("Tenant no-show notifications could not be loaded", error.message);
      return null;
    }
    rows.push(...(data ?? []) as unknown as Appointment[]);
    if (!data || data.length < 1000) break;
  }
  const rescheduled = rows.filter(row => row.job?.active_appointments?.length).map(row => row.job_id);
  return unresolvedTenantNoShows(rows, rescheduled);
}
