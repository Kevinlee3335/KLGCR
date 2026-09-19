"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

const permittedRoles = ["admin", "maintenance_staff", "cleaner"] as const;
function dateTime(dateValue: FormDataEntryValue | null, timeValue: FormDataEntryValue | null) {
  const date = String(dateValue || "").trim();
  const time = String(timeValue || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error("Select a valid date and start time.");
  const value = new Date(`${date}T${time}:00+08:00`);
  if (Number.isNaN(value.getTime())) throw new Error("Select a valid date and time.");
  return value.toISOString();
}
function wholeDay(dateValue: FormDataEntryValue | null, end = false) {
  const date = String(dateValue || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Select a valid date.");
  return new Date(`${date}T${end ? "23:59:59" : "00:00:00"}+08:00`).toISOString();
}

function refresh() { revalidatePath("/staff/calendar"); revalidatePath("/admin/calendar"); }

export async function createCalendarEvent(data: FormData) {
  const actor = await requireRole([...permittedRoles]);
  const eventType = actor.role === "admin" && ["work", "leave", "no_leave"].includes(String(data.get("eventType"))) ? String(data.get("eventType")) : "work";
  const title = String(data.get("title") || (eventType === "leave" ? "On leave" : eventType === "no_leave" ? "No leave allowed" : "")).trim();
  const notes = String(data.get("notes") || "").trim();
  if (title.length < 2 || title.length > 160) throw new Error("Title must be 2 to 160 characters.");
  const isAllDay = eventType === "leave" || eventType === "no_leave";
  const startsAt = isAllDay ? wholeDay(data.get("date")) : dateTime(data.get("date"), data.get("startTime"));
  const endsAt = isAllDay ? wholeDay(data.get("endDate") || data.get("date"), true) : data.get("endTime") ? dateTime(data.get("date"), data.get("endTime")) : null;
  if (endsAt && endsAt < startsAt) throw new Error("End time must be after the start time.");
  const db = await createClient();
  let audience = "individual";
  let assignedTo: string | null = actor.id;
  if (actor.role === "admin") {
    audience = eventType === "no_leave" ? "all_staff" : data.get("audience") === "all_staff" ? "all_staff" : "individual";
    if (eventType === "leave") audience = "individual";
    assignedTo = audience === "all_staff" ? null : String(data.get("assignedTo") || "").trim();
    if (audience === "individual") {
      if (!assignedTo) throw new Error("Choose an employee.");
      const { data: recipient } = await db.from("profiles").select("id").eq("id", assignedTo).eq("is_active", true).is("deleted_at", null).maybeSingle();
      if (!recipient) throw new Error("The selected employee is not available.");
    }
  }
  const { error } = await db.from("calendar_events").insert({ title, notes: notes || null, starts_at: startsAt, ends_at: endsAt, audience, assigned_to: assignedTo, created_by: actor.id, event_type: eventType });
  if (error) throw new Error(error.message);
  refresh();
}
export async function deleteCalendarEvent(data: FormData) {
  await requireRole([...permittedRoles]);
  const id = String(data.get("id") || "").trim();
  if (!id) throw new Error("Calendar item is missing.");
  const db = await createClient();
  const { error } = await db.from("calendar_events").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}