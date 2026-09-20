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
  complaint: { room_no: string; category: string; block: { code: string } | null } | null;
};

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).format(new Date());
}

function monthRange(month: string) {
  const [year, value] = month.split("-").map(Number);
  const lastDay = new Date(year, value, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export default async function StaffCalendar({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const profile = await requireRole(["maintenance_staff"]);
  const query = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month || "") ? query.month! : currentMonth();
  const { start, end } = monthRange(month);
  const supabase = await createClient();
  const { data, error } = await supabase.from("appointments")
    .select("id,job_id,appointment_date,appointment_time,status,job:maintenance_jobs!appointments_job_id_fkey(job_no),complaint:complaints!appointment_complaint_id_fkey(room_no,category,block:blocks!complaints_block_id_fkey(code))")
    .gte("appointment_date", start)
    .lte("appointment_date", end)
    .not("status", "in", '("cancelled","no_show")')
    .order("appointment_date")
    .order("appointment_time");

  const appointments = (data || []) as unknown as AppointmentRow[];
  const items: CalendarItem[] = appointments.map((appointment) => ({
    id: appointment.id,
    date: appointment.appointment_date,
    time: appointment.appointment_time,
    label: `Block ${appointment.complaint?.block?.code || "–"} · ${appointment.complaint?.room_no || "–"}`,
    detail: appointment.job?.job_no || appointment.complaint?.category || "Appointment",
    href: appointment.job_id ? `/staff/jobs/${appointment.job_id}` : null,
    tone: `calendar-${appointment.status}`,
  }));

  return <AppShell profile={profile} title="Calendar">
    {error ? <p className="error">{error.message}</p> : <AppointmentCalendar month={month} items={items}/>}
  </AppShell>;
}
