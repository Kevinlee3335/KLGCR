import type { JobRow } from "./phase2";
import type { createClient } from "./supabase/server";

type Database = Awaited<ReturnType<typeof createClient>>;
const pageSize = 50;
export async function readStaffJobs(db: Database, staffId: string, options: { recent: true } | { page: number; status?: string }) {
  let query = db.from("maintenance_jobs").select("id,job_no,room_no,category,description,priority,status,checkout_date,assigned_to,assigned_at,updated_at,complaint:complaints!complaint_id(id,complaint_no,availability_date,availability_time,room_access_permission),block:blocks!block_id(id,code)")
    .eq("assigned_to", staffId)
    .order("assigned_at", { ascending: false }).order("id");
  if ("recent" in options) {
    query = query.limit(5);
  } else {
    query = options.status ? query.eq("status", options.status) : query.in("status", ["assigned", "in_progress", "waiting_checkout"]);
    const offset = (options.page - 1) * pageSize;
    query = query.range(offset, offset + pageSize);
  }
  const { data, error } = await query;
  const rows = (data ?? []).slice(0, pageSize) as unknown as JobRow[];
  const complaintIds = [...new Set(rows.flatMap(row => row.complaint?.id ? [row.complaint.id] : []))];
  return { rows, error, hasNext: (data?.length ?? 0) > pageSize, appointments: loadAppointments(db, complaintIds) };
}

// One complaint may have more than one job and more than one appointment.
async function loadAppointments(db: Database, complaintIds: string[]) {
  const grouped = new Map<string, NonNullable<JobRow["appointments"]>>();
  if (complaintIds.length) {
    const {data} = await db.from("appointments").select("complaint_id,appointment_date,appointment_time,status").in("complaint_id", complaintIds);
    for (const row of data ?? []) {
      const group = grouped.get(row.complaint_id) ?? [];
      group.push(row);
      grouped.set(row.complaint_id, group);
    }
  }
  return grouped;
}
