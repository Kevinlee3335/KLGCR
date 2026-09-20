import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AppointmentCalendar, type CalendarItem } from "@/components/appointment-calendar";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type AppointmentRow = {
  id: string; job_id: string | null; appointment_date: string; appointment_time: string; status: string;
  job: { job_no: string } | null; staff: { full_name: string } | null;
  complaint: { room_no: string; category: string; block: { code: string } | null } | null;
};
type CalendarEvent = {
  id: string; event_type: "leave" | "meeting" | "other"; title: string; event_date: string;
  start_time: string | null; notes: string | null; staff: { full_name: string } | null;
};

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).format(new Date());
}
function monthRange(month: string) {
  const [year, value] = month.split("-").map(Number);
  const lastDay = new Date(year, value, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}
const eventLabel = { leave: "Leave", meeting: "Meeting", other: "Other" } as const;

export default async function AdminCalendar({ searchParams }: { searchParams: Promise<{ month?: string; error?: string }> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const query = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month || "") ? query.month! : currentMonth();
  const { start, end } = monthRange(month);
  const supabase = await createClient();
  const [appointmentResult, eventResult, staffResult] = await Promise.all([
    supabase.from("appointments")
      .select("id,job_id,appointment_date,appointment_time,status,job:maintenance_jobs!appointments_job_id_fkey(job_no),staff:profiles!appointments_assigned_staff_fkey(full_name),complaint:complaints!appointment_complaint_id_fkey(room_no,category,block:blocks!complaints_block_id_fkey(code))")
      .gte("appointment_date", start).lte("appointment_date", end)
      .not("status", "in", '("cancelled","no_show")').order("appointment_date").order("appointment_time"),
    supabase.from("calendar_events")
      .select("id,event_type,title,event_date,start_time,notes,staff:profiles!calendar_events_assigned_to_fkey(full_name)")
      .gte("event_date", start).lte("event_date", end).order("event_date").order("start_time"),
    supabase.from("profiles").select("id,full_name,role").in("role", ["maintenance_staff", "cleaner"]).eq("is_active", true).is("deleted_at", null).order("full_name"),
  ]);

  async function createCalendarEvent(formData: FormData) {
    "use server";
    await requireRole(["admin"]);
    const eventType = String(formData.get("event_type") || "");
    const title = String(formData.get("title") || "").trim();
    const eventDate = String(formData.get("event_date") || "");
    const startTime = String(formData.get("start_time") || "") || null;
    const assignedTo = String(formData.get("assigned_to") || "") || null;
    const notes = String(formData.get("notes") || "").trim() || null;
    if (!["leave", "meeting", "other"].includes(eventType) || !title || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      redirect(`/admin/calendar?month=${month}&error=Please+complete+the+event+details`);
    }
    const { error } = await (await createClient()).from("calendar_events").insert({
      event_type: eventType, title, event_date: eventDate, start_time: startTime, assigned_to: assignedTo, notes,
    });
    if (error) redirect(`/admin/calendar?month=${month}&error=${encodeURIComponent(error.message)}`);
    revalidatePath("/admin/calendar");
    redirect(`/admin/calendar?month=${month}`);
  }

  const appointments = (appointmentResult.data || []) as unknown as AppointmentRow[];
  const events = (eventResult.data || []) as unknown as CalendarEvent[];
  const items: CalendarItem[] = [
    ...appointments.map((appointment) => ({
      id: `appointment-${appointment.id}`, date: appointment.appointment_date, time: appointment.appointment_time,
      label: `Block ${appointment.complaint?.block?.code || "–"} · ${appointment.complaint?.room_no || "–"}`,
      detail: `${appointment.staff?.full_name || "Unassigned"} · ${appointment.job?.job_no || appointment.complaint?.category || "Appointment"}`,
      href: appointment.job_id ? `/admin/jobs/${appointment.job_id}` : null, tone: `calendar-${appointment.status}`,
    })),
    ...events.map((event) => ({
      id: `event-${event.id}`, date: event.event_date, time: event.start_time || "All day",
      label: event.title, detail: `${eventLabel[event.event_type]} · ${event.staff?.full_name || "All staff"}${event.notes ? ` · ${event.notes}` : ""}`,
      href: null, tone: `calendar-${event.event_type}`,
    })),
  ];
  const loadError = appointmentResult.error;

  return <AppShell profile={profile} title="Calendar">
    {profile.role === "admin" && !eventResult.error && <section className="calendar-event-card">
      <div><p className="eyebrow">Add to calendar</p><h2>Leave, Meeting or Other</h2><p className="subtle">Add staff leave and operational arrangements so they are visible before work is assigned.</p></div>
      <form action={createCalendarEvent} className="calendar-event-form">
        <select name="event_type" defaultValue="leave" aria-label="Event type"><option value="leave">Leave</option><option value="meeting">Meeting</option><option value="other">Other</option></select>
        <input name="title" required placeholder="Title, e.g. Lift maintenance" />
        <input name="event_date" required type="date" />
        <input name="start_time" type="time" aria-label="Start time" />
        <select name="assigned_to" defaultValue=""><option value="">All staff / no staff selected</option>{(staffResult.data || []).map((staff) => <option key={staff.id} value={staff.id}>{staff.full_name}</option>)}</select>
        <input name="notes" placeholder="Notes (optional)" />
        <button className="button" type="submit">Add to Calendar</button>
      </form>
    </section>}
    {eventResult.error && <p className="subtle">Leave, Meeting and Other events are being connected. Existing maintenance appointments remain available below.</p>}\n    {query.error && <p className="error">{query.error}</p>}
    {loadError ? <p className="error">Calendar could not load: {loadError.message}</p> : <AppointmentCalendar month={month} items={items}/>}
  </AppShell>;
}
