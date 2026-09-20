import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AppointmentCalendar, type CalendarItem } from "@/components/appointment-calendar";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type AppointmentRow = { id: string; job_id: string | null; appointment_date: string; appointment_time: string; status: string; job: { job_no: string } | null; staff: { full_name: string } | null; complaint: { room_no: string; category: string; block: { code: string } | null } | null; };
type JobRow = { id: string; job_no: string; room_no: string; category: string; scheduled_for: string; status: string; block: { code: string } | null; assignee: { full_name: string } | null; };
type CalendarEvent = { id: string; title: string; notes: string | null; starts_at: string; ends_at: string | null; event_type: "work" | "leave" | "no_leave" | "meeting" | "other"; audience: "individual" | "all_staff"; staff: { full_name: string } | null; };

function currentMonth() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).format(new Date()); }
function monthRange(month: string) { const [year, value] = month.split("-").map(Number); const lastDay = new Date(year, value, 0).getDate(); return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}`, next: `${value === 12 ? year + 1 : year}-${String(value === 12 ? 1 : value + 1).padStart(2, "0")}-01` }; }
function malaysiaDate(value: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
function malaysiaTime(value: string) { return new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)); }
function eventDates(event: CalendarEvent) { const first = malaysiaDate(event.starts_at); const last = malaysiaDate(event.ends_at || event.starts_at); const dates: string[] = []; const cursor = new Date(`${first}T00:00:00Z`); const endDate = new Date(`${last}T00:00:00Z`); while (cursor <= endDate) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); } return dates; }
const eventLabels = { work: "Work", leave: "Leave", no_leave: "No leave", meeting: "Meeting", other: "Other" } as const;

export default async function AdminCalendar({ searchParams }: { searchParams: Promise<{ month?: string; error?: string }> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const query = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month || "") ? query.month! : currentMonth();
  const { start, end, next } = monthRange(month);
  const supabase = await createClient();
  const [appointmentResult, jobResult, eventResult, staffResult] = await Promise.all([
    supabase.from("appointments").select("id,job_id,appointment_date,appointment_time,status,job:maintenance_jobs!appointments_job_id_fkey(job_no),staff:profiles!appointments_assigned_staff_fkey(full_name),complaint:complaints!appointment_complaint_id_fkey(room_no,category,block:blocks!complaints_block_id_fkey(code))").gte("appointment_date", start).lte("appointment_date", end).not("status", "in", '("cancelled","no_show")').order("appointment_date").order("appointment_time"),
    supabase.from("maintenance_jobs").select("id,job_no,room_no,category,scheduled_for,status,block:blocks!maintenance_jobs_block_id_fkey(code),assignee:profiles!maintenance_jobs_assigned_to_fkey(full_name)").gte("scheduled_for", start).lte("scheduled_for", end).not("status", "in", '("completed","cancelled")').order("scheduled_for"),
    supabase.from("calendar_events").select("id,title,notes,starts_at,ends_at,event_type,audience,staff:profiles!calendar_events_assigned_to_fkey(full_name)").gte("starts_at", `${start}T00:00:00+08:00`).lt("starts_at", `${next}T00:00:00+08:00`).order("starts_at"),
    supabase.from("profiles").select("id,full_name,role").in("role", ["maintenance_staff", "cleaner"]).eq("is_active", true).is("deleted_at", null).order("full_name"),
  ]);

  async function createCalendarEvent(formData: FormData) {
    "use server";
    await requireRole(["admin"]);
    const eventType = String(formData.get("event_type") || "");
    const title = String(formData.get("title") || "").trim();
    const eventDate = String(formData.get("event_date") || "");
    const startTime = String(formData.get("start_time") || "09:00");
    const endDate = String(formData.get("end_date") || "") || eventDate;
    const assignedTo = String(formData.get("assigned_to") || "") || null;
    const notes = String(formData.get("notes") || "").trim() || null;
    if (!["work", "leave", "meeting", "other"].includes(eventType) || title.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < eventDate) redirect(`/admin/calendar?month=${month}&error=Please+complete+the+event+details`);
    const { error } = await (await createClient()).from("calendar_events").insert({ event_type: eventType, title, notes, starts_at: `${eventDate}T${startTime}:00+08:00`, ends_at: `${endDate}T23:59:59+08:00`, audience: assignedTo ? "individual" : "all_staff", assigned_to: assignedTo });
    if (error) redirect(`/admin/calendar?month=${month}&error=${encodeURIComponent(error.message)}`);
    revalidatePath("/admin/calendar"); redirect(`/admin/calendar?month=${month}`);
  }

  const appointments = (appointmentResult.data || []) as unknown as AppointmentRow[];
  const appointmentJobIds = new Set(appointments.map((row) => row.job_id).filter((id): id is string => Boolean(id)));
  const jobs = ((jobResult.data || []) as unknown as JobRow[]).filter((job) => !appointmentJobIds.has(job.id));
  const events = (eventResult.data || []) as unknown as CalendarEvent[];
  const items: CalendarItem[] = [
    ...appointments.map((a) => ({ id: `appointment-${a.id}`, date: a.appointment_date, time: a.appointment_time, label: `Block ${a.complaint?.block?.code || "–"} · ${a.complaint?.room_no || "–"}`, detail: `${a.staff?.full_name || "Unassigned"} · ${a.job?.job_no || a.complaint?.category || "Appointment"}`, href: a.job_id ? `/admin/jobs/${a.job_id}` : null, tone: `calendar-${a.status}` })),
    ...jobs.map((job) => ({ id: `job-${job.id}`, date: job.scheduled_for, time: "09:00", label: `Block ${job.block?.code || "–"} · ${job.room_no}`, detail: `${job.assignee?.full_name || "Unassigned"} · ${job.job_no}`, href: `/admin/jobs/${job.id}`, tone: "calendar-work" })),
    ...events.flatMap((event) => eventDates(event).filter((date) => date >= start && date <= end).map((date, index) => ({ id: `event-${event.id}-${date}`, date, time: index === 0 ? malaysiaTime(event.starts_at) : "All day", label: event.title, detail: `${eventLabels[event.event_type]} · ${event.staff?.full_name || "All staff"}${event.notes ? ` · ${event.notes}` : ""}`, href: null, tone: `calendar-${event.event_type}` }))),
  ];
  const loadError = appointmentResult.error || jobResult.error || eventResult.error;

  return <AppShell profile={profile} title="Calendar">
    {profile.role === "admin" && <section className="calendar-event-card"><div><p className="eyebrow">Add to calendar</p><h2>Leave, Meeting or Other</h2><p className="subtle">All staff arrangements are shown together with maintenance work.</p></div><form action={createCalendarEvent} className="calendar-event-form"><select name="event_type" defaultValue="leave"><option value="leave">Leave</option><option value="meeting">Meeting</option><option value="other">Other</option><option value="work">Work</option></select><input name="title" required minLength={2} placeholder="Title, e.g. Lift maintenance" /><input name="event_date" required type="date" aria-label="From date" /><input name="end_date" required type="date" aria-label="To date" /><input name="start_time" defaultValue="09:00" type="time" /><select name="assigned_to" defaultValue=""><option value="">All staff</option>{(staffResult.data || []).map((staff) => <option key={staff.id} value={staff.id}>{staff.full_name}</option>)}</select><input name="notes" placeholder="Notes (optional)" /><button className="button" type="submit">Add to Calendar</button></form></section>}
    {query.error && <p className="error">{query.error}</p>}
    {loadError ? <p className="error">Calendar could not load: {loadError.message}</p> : <AppointmentCalendar month={month} items={items}/>}
  </AppShell>;
}
