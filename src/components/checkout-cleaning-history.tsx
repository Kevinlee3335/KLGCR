import Form from "next/form";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import type { CheckoutReportRoom, CheckoutStatusReport } from "./checkout-status-dashboard";
import styles from "./checkout-cleaning-history.module.css";

type ReportRequest = PromiseLike<{ data: unknown; error: unknown }>;

function cleanerKey(room: CheckoutReportRoom) {
  return room.cleaner_id || `name:${room.cleaner}`;
}

const completedTime = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  hour: "numeric",
  minute: "2-digit",
});

export async function CheckoutCleaningHistory({ today, date, cleaner, report, currentReport }: {
  today: string;
  date: string;
  cleaner: string;
  report: ReportRequest;
  currentReport: ReportRequest;
}) {
  const [selected, current] = await Promise.all([report, currentReport]);
  const selectedRooms = (selected.data as CheckoutStatusReport | null)?.rooms ?? [];
  const currentRooms = (current.data as CheckoutStatusReport | null)?.rooms ?? [];
  const cleaners = new Map([...currentRooms, ...selectedRooms]
    .filter(room => room.cleaner_id || room.cleaner_today)
    .map(room => [cleanerKey(room), room.cleaner]));
  const selectedCleaner = cleaners.has(cleaner) ? cleaner : "";
  const rooms = selectedRooms.filter(room => room.cleaner_today && (!selectedCleaner || cleanerKey(room) === selectedCleaner));
  const todayHref = { pathname: "/admin/checkouts", query: selectedCleaner ? { completedCleaner: selectedCleaner } : {}, hash: "cleaning-completions" };

  return (
    <section id="cleaning-completions" className={styles.panel} aria-labelledby="cleaning-completions-title">
      <header className={styles.header}>
        <span className={styles.icon}><CalendarDays size={21} aria-hidden="true" /></span>
        <div>
          <h2 id="cleaning-completions-title">Cleaning Completions</h2>
          <p>Find rooms by cleaner and completion date.</p>
        </div>
      </header>
      <Form key={`${date}:${selectedCleaner}`} action="/admin/checkouts#cleaning-completions" className={styles.filters}>
        <label>Completion date
          <input type="date" name="completedDate" defaultValue={date} max={today} required />
        </label>
        <label>Cleaner
          <select name="completedCleaner" defaultValue={selectedCleaner}>
            <option value="">All cleaners</option>
            {[...cleaners].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </label>
        <button className="button" type="submit">Show rooms</button>
        <Link className="button secondary" href={todayHref}>Today</Link>
      </Form>
      {selected.error || !selected.data ? (
        <p className={styles.summary} role="alert">Unable to load cleaning completions. Please try again.</p>
      ) : (
        <>
          <p className={styles.summary}>{rooms.length ? `${rooms.length} room${rooms.length === 1 ? "" : "s"} completed` : "No rooms completed for this selection."}</p>
          {rooms.length > 0 && <ul className={styles.rooms}>
            {rooms.map(room => (
              <li key={room.id}>
                <Link href={`/admin/checkouts/${room.id}`}>
                  <strong>{room.block}{room.room_no}</strong>
                  <span>{room.cleaner}</span>
                  {room.cleaned_at && <time dateTime={room.cleaned_at}>{completedTime.format(new Date(room.cleaned_at))}</time>}
                </Link>
              </li>
            ))}
          </ul>}
        </>
      )}
    </section>
  );
}
