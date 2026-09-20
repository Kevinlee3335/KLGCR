"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export type CalendarItem = {
  id: string;
  date: string;
  time: string;
  label: string;
  detail: string;
  href: string | null;
  tone?: string;
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

export function AppointmentCalendar({ month, items }: { month: string; items: CalendarItem[] }) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const previous = new Date(year, monthIndex - 1, 1);
  const next = new Date(year, monthIndex + 1, 1);
  const today = malaysiaToday();
  const firstUsefulDate = today.startsWith(`${month}-`) ? today : items[0]?.date || `${month}-01`;
  const [selectedDate, setSelectedDate] = useState(firstUsefulDate);

  useEffect(() => {
    setSelectedDate(firstUsefulDate);
  }, [firstUsefulDate]);

  const itemsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const existing = grouped.get(item.date) || [];
      existing.push(item);
      grouped.set(item.date, existing);
    }
    return grouped;
  }, [items]);

  const selectedItems = itemsByDate.get(selectedDate) || [];
  const cells = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });

  return <section className="calendar-panel">
    <header className="calendar-heading">
      <div><p className="eyebrow">Monthly work view</p><h2>{monthName(year, monthIndex)}</h2><p className="subtle">Tap a date to see every item in full below the calendar.</p></div>
      <div className="calendar-controls"><Link href={`?month=${monthKey(previous.getFullYear(), previous.getMonth())}`}>‹ Previous</Link><Link href={`?month=${monthKey(new Date().getFullYear(), new Date().getMonth())}`}>Today</Link><Link href={`?month=${monthKey(next.getFullYear(), next.getMonth())}`}>Next ›</Link></div>
    </header>
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
            <div className="calendar-items">{dayItems.map(item => item.href ? <Link href={item.href} className={`calendar-item ${item.tone || ""}`} key={item.id}><strong>{displayTime(item.time)}</strong><span>{item.label}</span><small>{item.detail}</small></Link> : <button type="button" onClick={() => setSelectedDate(date)} className={`calendar-item ${item.tone || ""}`} key={item.id}><strong>{displayTime(item.time)}</strong><span>{item.label}</span><small>{item.detail}</small></button>)}</div>
          </div>;
        })}
      </div>
    </div>
    <section className="calendar-day-details" aria-live="polite">
      <header><div><p className="eyebrow">Selected day</p><h3>{fullDate(selectedDate)}</h3></div><span>{selectedItems.length} {selectedItems.length === 1 ? "item" : "items"}</span></header>
      {selectedItems.length ? <div className="calendar-day-detail-list">{selectedItems.map(item => {
        const content = <><strong>{displayTime(item.time)}</strong><div><span>{item.label}</span><small>{item.detail}</small></div></>;
        return item.href ? <Link href={item.href} className={`calendar-day-detail ${item.tone || ""}`} key={item.id}>{content}</Link> : <article className={`calendar-day-detail ${item.tone || ""}`} key={item.id}>{content}</article>;
      })}</div> : <p className="calendar-day-empty">No calendar items for this day.</p>}
    </section>
    {!items.length && <p className="calendar-empty">No appointments are scheduled for this month.</p>}
  </section>;
}
