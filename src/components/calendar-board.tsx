"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { johorPublicHolidays } from "@/lib/johor-holidays";
import type { CalendarEvent } from "./calendar-event-list";

const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const malaysia = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" });
const time = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit" });
function isoDate(value: Date) { return malaysia.format(value); }
function firstOfMonth(value: Date) { return new Date(value.getFullYear(), value.getMonth(), 1, 12); }

export function CalendarBoard({ events, admin, form }: { events: CalendarEvent[]; admin?: boolean; form: ReactNode }) {
  const [month, setMonth] = useState(() => firstOfMonth(new Date()));
  const [showForm, setShowForm] = useState(false);
  const title = new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric" }).format(month);
  const dates = useMemo(() => { const start = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay(), 12); return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 12)); }, [month]);
  const eventsByDay = useMemo(() => { const map = new Map<string, CalendarEvent[]>(); for (const event of events) {
      const start = new Date(event.starts_at); const end = new Date(event.ends_at || event.starts_at);
      for (let day = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12); day <= end; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 12)) {
        const key = isoDate(day); map.set(key, [...(map.get(key) || []), event]);
      }
    } return map; }, [events]);
  const holidays = useMemo(() => new Map(johorPublicHolidays.map((holiday) => [holiday.date, holiday.name])), []);
  const today = isoDate(new Date());
  const shift = (amount: number) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1, 12));
  return <div className="phone-calendar"><div className="calendar-toolbar"><div><p className="eyebrow">Johor · Malaysia</p><h2>{title}</h2><p className="subtle">Public holidays, team schedules and your own work.</p></div><div className="calendar-controls"><button className="button secondary calendar-today" type="button" onClick={() => setMonth(firstOfMonth(new Date()))}>Today</button><button className="calendar-arrow" type="button" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft size={20}/></button><button className="calendar-arrow" type="button" aria-label="Next month" onClick={() => shift(1)}><ChevronRight size={20}/></button>{admin && <button className="button calendar-add" type="button" onClick={() => setShowForm((open) => !open)}><Plus size={18}/>{showForm ? "Close" : "Add schedule"}</button>}</div></div><section className="calendar-grid" aria-label={`${title} calendar`}><div className="calendar-weekdays">{weekday.map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-days">{dates.map((day) => { const date = isoDate(day); const dayEvents = eventsByDay.get(date) || []; const holiday = holidays.get(date); const outside = day.getMonth() !== month.getMonth(); return <div className={`calendar-day${outside ? " outside" : ""}${date === today ? " is-today" : ""}`} key={date}><div className="calendar-date"><span>{day.getDate()}</span>{holiday && <small>Holiday</small>}</div>{holiday && <div className="calendar-holiday" title={holiday}>{holiday}</div>}<div className="calendar-events">{dayEvents.slice(0, 3).map((event) => <div className={`calendar-event-pill ${event.event_type}${event.audience === "all_staff" ? " all" : ""}`} title={`${event.event_type === "work" ? time.format(new Date(event.starts_at)) : "All day"} · ${event.title}`} key={event.id}><span>{event.event_type === "leave" ? "LEAVE" : event.event_type === "no_leave" ? "NO LEAVE" : time.format(new Date(event.starts_at))}</span>{event.event_type === "leave" && event.assignee?.full_name ? `${event.assignee.full_name}: ${event.title}` : event.title}</div>)}{dayEvents.length > 3 && <small className="calendar-more">+{dayEvents.length - 3} more</small>}</div></div>; })}</div></section>{admin && showForm && <section className="calendar-create panel"><h3>Create schedule</h3><p className="subtle">Choose one employee or everyone.</p>{form}</section>}{!admin && <section className="panel calendar-personal"><div><h3>Add my reminder</h3><p className="subtle">Only you and Admin can see reminders you add yourself.</p></div>{form}</section>}<div className="calendar-legend"><span><i className="holiday-dot"/>Johor public holiday</span><span><i className="event-dot"/>Your schedule</span><span><i className="event-dot all"/>All employees</span></div></div>;
}