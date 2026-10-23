"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

export type CalendarItem = {
  id: string;
  date: string;
  time: string;
  label: string;
  detail: string;
  expandedDetail?: string;
  href: string | null;
  tone?: string;
  kind?: "maintenance" | "daily_task" | "meeting" | "leave" | "other" | "holiday";
};

function monthName(year: number, monthIndex: number) {
  return new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(Date.UTC(year, monthIndex, 1)));
}

function monthKey(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function malaysiaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function displayTime(time: string) {
  return time === "All day" ? time : time.slice(0, 5);
}

function fullDate(date: string) {
  return new Intl.DateTimeFormat("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(`${date}T00:00:00+08:00`));
}

export function AppointmentCalendar({ month, items, compact = false }: { month: string; items: CalendarItem[]; compact?: boolean }) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const previous = new Date(year, monthIndex - 1, 1);
  const next = new Date(year, monthIndex + 1, 1);
  const today = malaysiaToday();
  const firstUsefulDate = today.startsWith(`${month}-`) ? today : items[0]?.date || `${month}-01`;
  const [selectedDate, setSelectedDate] = useState(firstUsefulDate);
  const [filter, setFilter] = useState("all");
  const detailsRef = useRef<HTMLElement>(null);
  const showDay = (date: string) => {
    setSelectedDate(date);
    detailsRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  const filters = [["all", "All"], ["maintenance", "Maintenance"], ["daily_task", "Daily Task"], ["meeting", "Meeting"], ["leave", "Leave"], ["other", "Work / Other"], ["holiday", "Public Holiday"]];

  useEffect(() => {
    setSelectedDate(firstUsefulDate);
  }, [firstUsefulDate]);

  const itemsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarItem[]>();
    for (const item of items) {
      if (compact && filter !== "all" && item.kind !== filter) continue;
      const existing = grouped.get(item.date) || [];
      existing.push(item);
      grouped.set(item.date, existing);
    }
    return grouped;
  }, [items, compact, filter]);

  const selectedItems = itemsByDate.get(selectedDate) || [];
  const cells = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });

  return <section className={`calendar-panel${compact ? " calendar-compact" : ""}`}>
    <header className="calendar-heading">
      <div><p className="eyebrow">Monthly work view</p><h2>{monthName(year, monthIndex)}</h2><p className="subtle">Tap a date to see every item in full below the calendar.</p></div>
      <div className="calendar-controls"><form method="get"><label className="sr-only" htmlFor="calendar-month">Select month and year</label><input id="calendar-month" type="month" name="month" defaultValue={month} required/><button type="submit" className="button secondary">Go</button></form><Link href={`?month=${monthKey(previous.getFullYear(), previous.getMonth())}`}>‹ Previous</Link><Link href={`?month=${monthKey(new Date().getFullYear(), new Date().getMonth())}`}>Today</Link><Link href={`?month=${monthKey(next.getFullYear(), next.getMonth())}`}>Next ›</Link></div>
    </header>
    {compact && <div className="calendar-type-filters" aria-label="Calendar categories">{filters.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} className={`button secondary${filter === value ? " calendar-filter-active" : ""}`} onClick={() => setFilter(value)}>{label}</button>)}</div>}
    <div className="calendar-grid-wrap">
      <div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">
        {cells.map((day, index) => {
          if (!day) return <div className="calendar-day calendar-empty-day" key={index}/>;
          const date = `${month}-${String(day).padStart(2, "0")}`;
          const dayItems = itemsByDate.get(date) || [];
          const isToday = date === today;
          const isSelected = date === selectedDate;
          return <div className={`calendar-day${isToday ? " calendar-today" : ""}${isSelected ? " calendar-selected" : ""}`} key={date}>
            <button className="calendar-date-button" type="button" aria-label={`Show ${fullDate(date)}`} aria-pressed={isSelected} onClick={() => setSelectedDate(date)}><span className="calendar-date">{day}</span></button>
            <div className="calendar-items">{(compact ? dayItems.slice(0, 3) : dayItems).map(item => item.href && !compact ? <Link href={item.href} className={`calendar-item ${item.tone || ""}`} key={item.id}><strong>{displayTime(item.time)}</strong><span>{item.label}</span><small>{item.detail}</small></Link> : <button type="button" onClick={() => showDay(date)} className={`calendar-item ${item.tone || ""}`} key={item.id}><strong>{displayTime(item.time)}</strong><span>{item.label}</span>{!compact && <small>{item.detail}</small>}</button>)}{compact && dayItems.length > 3 && <button type="button" className="calendar-more" onClick={() => showDay(date)} aria-label={`Show all ${dayItems.length} items on ${fullDate(date)}`}>+{dayItems.length - 3} more</button>}</div>
          </div>;
        })}
      </div>
    </div>
    <section ref={detailsRef} className="calendar-day-details" aria-live="polite">
      <header><div><p className="eyebrow">Selected day</p><h3>{fullDate(selectedDate)}</h3></div><span>{selectedItems.length} {selectedItems.length === 1 ? "item" : "items"}</span></header>
      {selectedItems.length ? <div className="calendar-day-detail-list">{selectedItems.map(item => {
        const content = <><strong>{displayTime(item.time)}</strong><div><span>{item.label}</span><small>{item.expandedDetail || item.detail}</small></div></>;
        return item.href ? <Link href={item.href} className={`calendar-day-detail ${item.tone || ""}`} key={item.id}>{content}</Link> : <article className={`calendar-day-detail ${item.tone || ""}`} key={item.id}>{content}</article>;
      })}</div> : <p className="calendar-day-empty">No calendar items for this day.</p>}
    </section>
    {!items.length && <p className="calendar-empty">No appointments are scheduled for this month.</p>}
  </section>;
}
