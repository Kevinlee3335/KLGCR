export type Complaint = { id: string; block_id: number; room_no: string; status: string };
export type Job = { id: string; complaint_id: string; status: string };
export type Appointment = { job_id: string; status: string; created_at: string };

export function summarize(complaints: Complaint[], jobs: Job[], appointments: Appointment[]) {
  const byComplaint = new Map<string, Job[]>();
  for (const job of jobs) byComplaint.set(job.complaint_id, [...(byComplaint.get(job.complaint_id) ?? []), job]);
  const latest = new Map<string, Appointment>();
  for (const appointment of appointments) {
    const old = latest.get(appointment.job_id);
    if (!old || appointment.created_at > old.created_at) latest.set(appointment.job_id, appointment);
  }
  const counts = { total: complaints.length, rooms: new Set<string>(), completed: 0, inProgress: 0, pendingMaterial: 0, monitoring: 0, tenantUnavailable: 0, assigned: 0, pending: 0, rejected: 0 };
  const roomFullyCompleted = new Map<string, boolean>();
  for (const complaint of complaints) {
    const room = `${complaint.block_id}:${complaint.room_no.trim().toUpperCase()}`;
    counts.rooms.add(room);
    const items = byComplaint.get(complaint.id) ?? [];
    const fullyCompleted = complaint.status !== "rejected" && items.length > 0 && items.every(job => job.status === "completed");
    roomFullyCompleted.set(room, (roomFullyCompleted.get(room) ?? true) && fullyCompleted);
    if (complaint.status === "rejected") counts.rejected++;
    else if (fullyCompleted) counts.completed++;
    else if (items.some(job => job.status === "pending_material")) counts.pendingMaterial++;
    else if (items.some(job => job.status === "under_monitoring")) counts.monitoring++;
    else if (items.some(job => latest.get(job.id)?.status === "no_show" && job.status !== "completed")) counts.tenantUnavailable++;
    else if (items.some(job => job.status === "in_progress" || job.status === "completed")) counts.inProgress++;
    else if (items.some(job => job.status === "assigned")) counts.assigned++;
    else counts.pending++;
  }
  return { ...counts, rooms: counts.rooms.size, completedRooms: [...roomFullyCompleted.values()].filter(Boolean).length, completionRate: counts.total ? Math.round(counts.completed / counts.total * 1000) / 10 : 0 };
}

export function malaysiaDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

export function dateRange(from: string | undefined, to: string | undefined, today: string) {
  const valid = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  const start = valid(from) ? from! : `${today.slice(0, 8)}01`;
  const end = valid(to) ? to! : today;
  if (start > end) return { error: "Start date must be on or before end date.", from: start, to: end, startUtc: "", endUtc: "" };
  const next = new Date(`${end}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { error: null, from: start, to: end, startUtc: `${start}T00:00:00+08:00`, endUtc: `${next.toISOString().slice(0, 10)}T00:00:00+08:00` };
}
