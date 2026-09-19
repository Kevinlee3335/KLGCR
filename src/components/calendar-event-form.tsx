"use client";

import { useState } from "react";
import { createCalendarEvent } from "@/app/(dashboard)/calendar-actions";

type Member = { id: string; full_name: string; role: string };

export function CalendarEventForm({ admin, members = [] }: { admin?: boolean; members?: Member[] }) {
  const [eventType, setEventType] = useState<"work" | "leave" | "no_leave">("work");
  const allDay = eventType !== "work";
  return <form action={createCalendarEvent} className="calendar-form"><div className="form-grid">
    {admin && <div className="field"><label>Schedule type</label><select name="eventType" value={eventType} onChange={(event) => setEventType(event.target.value as "work" | "leave" | "no_leave")}><option value="work">Work / Meeting / Training</option><option value="leave">Staff on leave</option><option value="no_leave">No leave period</option></select></div>}
    <div className="field"><label>Title</label><input name="title" placeholder={eventType === "leave" ? "e.g. On leave" : eventType === "no_leave" ? "e.g. No annual leave allowed" : "e.g. Friday 4 PM maintenance meeting"} required={eventType === "work"} maxLength={160}/></div>
    {admin && eventType !== "no_leave" && <><div className="field"><label>Send to</label><select name="audience" defaultValue="individual"><option value="individual">One employee</option>{eventType === "work" && <option value="all_staff">All employees</option>}</select></div><div className="field"><label>Employee</label><select name="assignedTo" required defaultValue=""><option value="" disabled>Select employee</option>{members.map((member) => <option value={member.id} key={member.id}>{member.full_name} · {member.role.replaceAll("_", " ")}</option>)}</select></div></>}
    <div className="field"><label>{allDay ? "Start date" : "Date"}</label><input type="date" name="date" required/></div>
    {allDay ? <div className="field"><label>End date</label><input type="date" name="endDate" required/></div> : <><div className="field"><label>Start time</label><input type="time" name="startTime" required/></div><div className="field"><label>End time (optional)</label><input type="time" name="endTime"/></div></>}
    <div className="field field-wide"><label>{eventType === "no_leave" ? "Remarks" : "Notes / location"}</label><textarea name="notes" placeholder={eventType === "no_leave" ? "Example: High occupancy, all leave is temporarily frozen." : "Meeting room, training topic, or what to bring."} rows={3}/></div>
  </div><button className="button" type="submit">{admin ? eventType === "leave" ? "Add leave" : eventType === "no_leave" ? "Add no leave period" : "Add schedule" : "Save my calendar item"}</button></form>;
}