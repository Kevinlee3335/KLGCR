"use client";

import { useState } from "react";

type Staff = { id: string; full_name: string };

export function CalendarEventForm({ staff, action }: { staff: Staff[]; action: (formData: FormData) => void }) {
  const [eventType, setEventType] = useState("leave");
  const [audience, setAudience] = useState("all_staff");
  const isLeave = eventType === "leave";

  return <form action={action} className="calendar-event-form calendar-event-smart-form">
    <label>Type<select name="event_type" value={eventType} onChange={(event) => setEventType(event.target.value)}><option value="leave">Leave</option><option value="meeting">Meeting</option><option value="other">Other</option><option value="work">Work</option></select></label>
    <label>Title<input name="title" required minLength={2} placeholder={isLeave ? "e.g. Annual leave" : "e.g. Lift maintenance"} /></label>
    <label>From date<input name="event_date" required type="date" /></label>
    <label>To date<input name="end_date" required type="date" /></label>
    <label>Time<input name="start_time" defaultValue="09:00" type="time" /></label>
    {isLeave && <label>Who is on leave?<select name="subject_staff" required defaultValue=""><option value="" disabled>Select staff</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>}
    {!isLeave && <input name="subject_staff" type="hidden" value="" />}
    <label>Publish to<select name="audience" value={audience} onChange={(event) => setAudience(event.target.value)}><option value="all_staff">All staff</option><option value="individual">One person</option><option value="multiple">Several people</option></select></label>
    {audience === "individual" && <label>Recipient<select name="recipient" required defaultValue=""><option value="" disabled>Select staff</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>}
    {audience === "multiple" && <fieldset><legend>Recipients</legend>{staff.map(person => <label key={person.id}><input type="checkbox" name="recipient" value={person.id}/>{person.full_name}</label>)}</fieldset>}
    <label className="calendar-notes">Notes (optional)<input name="notes" placeholder="Add note" /></label>
    <button className="button" type="submit">Add to Calendar</button>
  </form>;
}
