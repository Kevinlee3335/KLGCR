export type ActivityEvent = {
  id: string;
  timestamp: string;
  action: string;
  actor?: string | null;
  remarks?: string | null;
};

export type JobHistoryRow = {
  id: string | number;
  previous_status: string;
  new_status: string;
  note: string | null;
  created_at: string;
  actor: { full_name: string } | null;
};

export type MaterialRequestRow = {
  id: string;
  request_no: string;
  status: string;
  note: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  issued_at: string | null;
  requester: { full_name: string } | null;
  reviewer: { full_name: string } | null;
  issuer: { full_name: string } | null;
  items: Array<{
    requested_qty: number;
    approved_qty: number | null;
    issued_qty: number | null;
    item: { item_code: string; description: string; unit: string | null } | null;
  }>;
};

export type AppointmentActivityRow = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  remarks: string | null;
  staff: { full_name: string } | null;
};

type TimelineSource = {
  job: {
    assigned_at: string;
    started_at: string | null;
    completed_at: string | null;
    action_taken?: string | null;
    monitoring_started_at?: string | null;
    monitoring_note?: string | null;
    assignee?: { full_name: string } | null;
    complaint?: {
      submitted_at?: string | null;
      reviewed_at?: string | null;
      reviewer?: { full_name: string } | null;
    } | null;
  };
  history: JobHistoryRow[];
  materials: MaterialRequestRow[];
  appointments: AppointmentActivityRow[];
};

function materialDetails(request: MaterialRequestRow, quantity: "requested_qty" | "approved_qty" | "issued_qty") {
  return request.items.map(({ item, ...quantities }) => {
    const qty = quantities[quantity];
    return `${item?.item_code || "Material"} · ${item?.description || "Unknown item"} — ${qty ?? quantities.requested_qty}${item?.unit ? ` ${item.unit}` : ""}`;
  }).join("; ");
}

function transitionAction(row: JobHistoryRow, priorMonitoring: boolean) {
  if (row.new_status === "in_progress") return row.previous_status === "pending_material" ? "Resume Work / In Progress" : "Start Job / In Progress";
  if (row.new_status === "pending_material") return "Pending Material";
  if (row.new_status === "under_monitoring") return priorMonitoring || row.previous_status === "under_monitoring" ? "Monitoring Update" : "Under Monitoring";
  if (row.new_status === "completed") return "Completed";
  if (row.new_status === "cancelled") return "Cancelled";
  return row.new_status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Builds one read-only chronology exclusively from timestamps already stored in the database. */
export function buildJobActivity({ job, history, materials, appointments }: TimelineSource): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const add = (event: ActivityEvent | null) => { if (event?.timestamp) events.push(event); };

  add(job.complaint?.submitted_at ? { id: "complaint-submitted", timestamp: job.complaint.submitted_at, action: "Complaint Submitted" } : null);
  add(job.complaint?.reviewed_at ? { id: "admin-reviewed", timestamp: job.complaint.reviewed_at, action: "Admin Reviewed / Approved", actor: job.complaint.reviewer?.full_name } : null);
  add({ id: "job-assigned", timestamp: job.assigned_at, action: "Job Assigned", actor: job.assignee?.full_name });

  appointments.forEach((appointment) => add({
    id: `appointment-${appointment.id}`,
    timestamp: `${appointment.appointment_date}T${appointment.appointment_time}+08:00`,
    action: "Maintenance Appointment Scheduled",
    actor: appointment.staff?.full_name,
    remarks: [appointment.remarks, appointment.status !== "confirmed" ? `Status: ${appointment.status.replaceAll("_", " ")}` : null].filter(Boolean).join(" · ") || null,
  }));

  let hasMonitoring = false;
  history.forEach((row) => {
    add({ id: `history-${row.id}`, timestamp: row.created_at, action: transitionAction(row, hasMonitoring), actor: row.actor?.full_name, remarks: row.note });
    if (row.new_status === "under_monitoring") hasMonitoring = true;
  });

  if (!history.some((row) => row.new_status === "in_progress" && row.previous_status !== "pending_material"))
    add(job.started_at ? { id: "job-started", timestamp: job.started_at, action: "Start Job / In Progress", actor: job.assignee?.full_name } : null);
  if (!history.some((row) => row.new_status === "under_monitoring"))
    add(job.monitoring_started_at ? { id: "job-monitoring", timestamp: job.monitoring_started_at, action: "Under Monitoring", actor: job.assignee?.full_name, remarks: job.monitoring_note } : null);
  if (!history.some((row) => row.new_status === "completed"))
    add(job.completed_at ? { id: "job-completed", timestamp: job.completed_at, action: "Completed", actor: job.assignee?.full_name, remarks: job.action_taken } : null);

  materials.forEach((request) => {
    add({ id: `material-requested-${request.id}`, timestamp: request.created_at, action: "Material Requested", actor: request.requester?.full_name, remarks: [request.note, materialDetails(request, "requested_qty")].filter(Boolean).join(" · ") });
    add(request.reviewed_at ? { id: `material-reviewed-${request.id}`, timestamp: request.reviewed_at, action: request.status === "rejected" ? "Material Rejected" : "Material Approved", actor: request.reviewer?.full_name, remarks: [request.rejection_reason, materialDetails(request, "approved_qty")].filter(Boolean).join(" · ") } : null);
    add(request.issued_at ? { id: `material-issued-${request.id}`, timestamp: request.issued_at, action: "Material Issued", actor: request.issuer?.full_name, remarks: materialDetails(request, "issued_qty") } : null);
  });

  return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime() || a.id.localeCompare(b.id));
}

export function formatMalaysiaActivity(timestamp: string) {
  const date = new Date(timestamp);
  return {
    date: new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(date),
  };
}
