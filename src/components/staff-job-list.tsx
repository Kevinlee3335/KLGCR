import { Suspense } from "react";
import type { readStaffJobs } from "@/lib/staff-job-list";
import type { JobRow } from "@/lib/phase2";
import { JobList } from "./phase2-ui";

type Appointments = Awaited<ReturnType<typeof readStaffJobs>>["appointments"];

export function StaffJobList({rows, appointments, viewerId, compact, returnTo}: {
  rows: JobRow[]; appointments: Appointments; viewerId: string; compact?: boolean; returnTo?: string;
}) {
  return <JobList rows={rows} staff compact={compact} viewerId={viewerId} returnTo={returnTo}
    appointmentCell={row => row.complaint?.id
      ? <Suspense fallback="Loading…"><Appointment complaints={appointments} id={row.complaint.id}/></Suspense>
      : "—"}/>;
}

async function Appointment({ complaints, id }: { complaints: Appointments; id: string }) {
  const rows = (await complaints).get(id);
  const active = rows?.find(row => row.status !== "cancelled" && row.status !== "no_show");
  return active ? `${active.appointment_date} ${active.appointment_time.slice(0, 5)}` : "—";
}
