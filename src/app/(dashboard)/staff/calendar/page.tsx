import { AppShell } from "@/components/app-shell";
import { AppointmentCalendar, type CalendarItem } from "@/components/appointment-calendar";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type AppointmentRow = { id: string; job_id: string | null; appointment_date: string; appointment_time: string; status: string; job: { job_no: string } | null; complaint: { room_no: string; category: string; block: { code: string } | null } | null; };
type CalendarEvent = { id: string; title: string; notes: string | null; starts_at: string; ends_at: string | null; event_type: "work" | "leave" | "no_leave" | "meeting" | "other"; staff: { full_name: string } | null; };

function currentMonth() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).format(new Date()); }
function monthRange(month: string) { const [year, value] = month.split("-").map(Number); const lastDay = new Date(year, value, 0).getDate(); return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}`, next: `${value === 12 ? year + 1 : year}-${String(value === 12 ? 1 : value + 1).padStart(2, "0")}-01` }; }
function malaysiaDate(value: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
function malaysiaTime(value: string) { return new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)); }\nfunction eventDates(event: CalendarEvent) { const first = malaysiaDate(event.starts_at); const last = malaysiaDate(event.ends_at || event.starts_at); const dates: string[] = []; const cursor = new Date(`${first}T00:00:00Z`); const endDate = new Date(`${last}T00:00:00Z`); while (cursor <= endDate) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); } return dates; }
const eventLabel = { work: "Work", leave: "Leave", no_leave: "No leave", meeting: "Meeting", other: "Other" } as const;

export default async function StaffCalendar({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const profile = await requireRole(["maintenance_staff", "cleaner"]);
  const query = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month || "") ? query.month! : currentMonth();
  const { start, end, next } = monthRange(month);
  const supabase = await createClient();
  const [appointmentResult, eventResult] = await Promise.all([
    supabase.from("appointments").select("id,job_id,appointment_date,appointment_time,status,job:maintenance_jobs!appointments_job_id_fkey(job_no),complaint:complaints!appointment_complaint_id_fkey(room_no,category,block:blocks!complaints_block_id_fkey(code))").gte("appointment_date", start).lte("appointment_date", end).not("status", "in", '("cancelled","no_show")').order("appointment_date").order("appointment_time"),
    supabase.from("calendar_events").select("id,title,notes,starts_at,ends_at,event_type,staff:profiles!calendar_events_assigned_to_fkey(full_name)").gte("starts_at", `${start}T00:00:00+08:00`).lt("starts_at", `${next}T00:00:00+08:00`).order("starts_at"),
  ]);
  const appointments = (appointmentResult.data || []) as unknown as AppointmentRow[];
  const events = (eventResult.data || []) as unknown as CalendarEvent[];
  const items: CalendarItem[] = [
    ...events.flatMap((event) => eventDates(event).filter((date) => date >= start && date <= end).map((date, index) => ({ id: `event-${event.id}-${date}`, date, time: index === 0 ? malaysiaTime(event.starts_at) : "All day", label: event.title, detail: `${eventLabel[event.event_type]}${event.staff ? ` · ${event.staff.full_name}` : ""}${event.notes ? ` · ${event.notes}` : ""}`, href: null, tone: `calendar-${event.event_type}` }))),
    ...appointments.map((appointment) => ({ id: appointment.id, date: appointment.appointment_date, time: appointment.appointment_time, label: `Block ${appointment.complaint?.block?.code || "–"} · ${appointment.complaint?.room_no || "–"}`, detail: appointment.job?.job_no || appointment.complaint?.category || "Appointment", href: appointment.job_id ? `/staff/jobs/${appointment.job_id}` : null, tone: `calendar-${appointment.status}` })),
  ];
  const error = appointmentResult.error || eventResult.error;

  return <AppShell profile={profile} title="Calendar">
    {error ? <p className="error">{error.message}</p> : <AppointmentCalendar month={month} items={items}/>}
  </AppShell>;
}
