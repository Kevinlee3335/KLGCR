import Link from "next/link";

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

export function AppointmentCalendar({ month, items }: { month: string; items: CalendarItem[] }) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const previous = new Date(year, monthIndex - 1, 1);
  const next = new Date(year, monthIndex + 1, 1);
  const itemsByDate = new Map<string, CalendarItem[]>();

  for (const item of items) {
    const existing = itemsByDate.get(item.date) || [];
    existing.push(item);
    itemsByDate.set(item.date, existing);
  }

  const cells = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });

  return <section className="calendar-panel">
    <header className="calendar-heading">
      <div><p className="eyebrow">Monthly work view</p><h2>{monthName(year, monthIndex)}</h2><p className="subtle">Tap a scheduled item to open its job details.</p></div>
      <div className="calendar-controls"><Link href={`?month=${monthKey(previous.getFullYear(), previous.getMonth())}`}>‹ Previous</Link><Link href={`?month=${monthKey(new Date().getFullYear(), new Date().getMonth())}`}>Today</Link><Link href={`?month=${monthKey(next.getFullYear(), next.getMonth())}`}>Next ›</Link></div>
    </header>
    <div className="calendar-grid-wrap">
      <div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">
        {cells.map((day, index) => {
          if (!day) return <div className="calendar-day calendar-empty-day" key={index}/>;
          const date = `${month}-${String(day).padStart(2, "0")}`;
          const dayItems = itemsByDate.get(date) || [];
          const isToday = date === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
          return <div className={`calendar-day${isToday ? " calendar-today" : ""}`} key={date}>
            <span className="calendar-date">{day}</span>
            <div className="calendar-items">{dayItems.map(item => item.href ? <Link href={item.href} className={`calendar-item ${item.tone || ""}`} key={item.id}><strong>{item.time.slice(0,5)}</strong><span>{item.label}</span><small>{item.detail}</small></Link> : <div className={`calendar-item ${item.tone || ""}`} key={item.id}><strong>{item.time.slice(0,5)}</strong><span>{item.label}</span><small>{item.detail}</small></div>)}</div>
          </div>;
        })}
      </div>
    </div>
    {!items.length && <p className="calendar-empty">No appointments are scheduled for this month.</p>}
  </section>;
}
