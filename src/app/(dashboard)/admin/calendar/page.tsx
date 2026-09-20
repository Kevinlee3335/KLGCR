import { AppShell } from "@/components/app-shell";
import { AppointmentCalendar, type CalendarItem } from "@/components/appointment-calendar";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type AppointmentRow = {
  id: string;
  job_id: string | null;
  appointment_date: string;
  appointment_time: string;
  status: string;
  job: { job_no: string } | null;
  staff: { full_name: string } | null;
  complaint: { room_no: string; category: string; block: { code: string } | null } | null;
};
type ScheduledJob = {
  id: string;
  job_no: string;
  room_no: string;
  category: string;
  scheduled_for: string;
  status: string;
  block: { code: string } | null;
  assignee: { full_name: string } | null;
};

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).format(new Date());
}
function monthRange(month: string) {
  const [year, value] = month.split("-").map(Number);
  const lastDay = new Date(year, value, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export default async function AdminCalendar({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const query = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month || "") ? query.month! : currentMonth();
  const { start, end } = monthRange(month);
  const supabase = await createClient();
  const [appointmentResult, jobResult] = await Promise.all([
    supabase.from("appointments").select("id,job_id,appointment_date,appointment_time,status,job:maintenance_jobs!appointments_job_id_fkey(job_no),staff:profiles!appointments_assigned_staff_fkey(full_name),complaint:complaints!appointment_complaint_id_fkey(room_no,category,block:blocks!complaints_block_id_fkey(code))").gte("appointment_date", start).lte("appointment_date", end).not("status", "in", '("cancelled","no_show")').order("appointment_date").order("appointment_time"),
    supabase.from("maintenance_jobs").select("id,job_no,room_no,category,scheduled_for,status,block:blocks!block_id(code),assignee:profiles!assigned_to(full_name)").gte("scheduled_for", start).lte("scheduled_for", end).not("status", "in", '("completed","cancelled")').order("scheduled_for"),
  ]);
  const appointments = (appointmentResult.data || []) as unknown as AppointmentRow[];
  const appointmentJobIds = new Set(appointments.map(row => row.job_id).filter((id): id is string => Boolean(id)));
  const scheduledJobs = ((jobResult.data || []) as unknown as ScheduledJob[]).filter(job => !appointmentJobIds.has(job.id));

  const items: CalendarItem[] = [
    ...appointments.map((appointment) => ({
      id: `appointment-${appointment.id}`,
      date: appointment.appointment_date,
      time: appointment.appointment_time,
      label: `Block ${appointment.complaint?.block?.code || "–"} · ${appointment.complaint?.room_no || "–"}`,
      detail: `${appointment.staff?.full_name || "Unassigned"} · ${appointment.job?.job_no || appointment.complaint?.category || "Appointment"}`,
      href: appointment.job_id ? `/admin/jobs/${appointment.job_id}` : null,
      tone: `calendar-${appointment.status}`,
    })),
    ...scheduledJobs.map((job) => ({
      id: `job-${job.id}`,
      date: job.scheduled_for,
      time: "09:00",
      label: `Block ${job.block?.code || "–"} · ${job.room_no}`,
      detail: `${job.assignee?.full_name || "Unassigned"} · ${job.job_no}`,
      href: `/admin/jobs/${job.id}`,
      tone: "calendar-scheduled",
    })),
  ];

  const error = appointmentResult.error || jobResult.error;
  return <AppShell profile={profile} title="Calendar">
    {error ? <p className="error">{error.message}</p> : <AppointmentCalendar month={month} items={items}/>}
  </AppShell>;
}
