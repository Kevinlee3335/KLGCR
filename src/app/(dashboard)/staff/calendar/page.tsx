import { AppShell } from "@/components/app-shell";
import { CalendarEventForm } from "@/components/calendar-event-form";
import { CalendarBoard } from "@/components/calendar-board";
import type { CalendarEvent } from "@/components/calendar-event-list";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
export default async function StaffCalendarPage(){const profile=await requireRole(["maintenance_staff","cleaner"]);const db=await createClient();const {data,error}=await db.from("calendar_events").select("id,title,notes,starts_at,ends_at,audience,created_by,assignee:profiles!calendar_events_assigned_to_fkey(full_name)").gte("starts_at",new Date(Date.now()-86400000).toISOString()).order("starts_at").limit(250);const events=(data||[]) as unknown as CalendarEvent[];return <AppShell profile={profile} title="My Calendar">{error?<p className="error">{error.message}</p>:<CalendarBoard events={events} form={<CalendarEventForm/>}/>}</AppShell>;}