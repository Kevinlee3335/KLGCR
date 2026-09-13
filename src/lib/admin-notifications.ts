export type TenantNoShowNotification = {
  id: string;
  job_id: string;
  appointment_date: string;
  appointment_time: string;
  attended_at: string | null;
  no_show_remarks: string | null;
  attendee: { full_name: string } | null;
  job: {
    id: string;
    job_no: string;
    status: string;
    room_no: string;
    block: { code: string } | null;
  } | null;
};

export function unresolvedTenantNoShows(rows: TenantNoShowNotification[], activeAppointmentJobIds: Iterable<string>) {
  const rescheduledJobs = new Set(activeAppointmentJobIds);
  const seenJobs = new Set<string>();

  return rows.filter((row) => {
    if (!row.job || ["completed", "cancelled"].includes(row.job.status)) return false;
    if (rescheduledJobs.has(row.job_id) || seenJobs.has(row.job_id)) return false;
    seenJobs.add(row.job_id);
    return true;
  });
}
