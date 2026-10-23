import Holidays from "date-holidays";
import type { CalendarItem } from "@/components/appointment-calendar";

// Company entitlement: 10 holiday types, 12 days. Never import all state holidays.
const names: Record<string, string> = {
  "chinese 01-0-01": "Chinese New Year · Day 1",
  "chinese 01-0-02": "Chinese New Year · Day 2",
  "1 Shawwal": "Hari Raya Puasa · Day 1",
  "2 Shawwal": "Hari Raya Puasa · Day 2",
  "03-23": "Birthday of Sultan Johor",
  "05-01": "Labour Day",
  "10 Dhu al-Hijjah": "Hari Raya Haji",
  "1st Monday in June": "Birthday of Yang di-Pertuan Agong",
  "08-31": "National Day",
  "09-16": "Malaysia Day",
  "12-25": "Christmas Day",
};
// 2026: company circular / johor.gov.my/rakyat/cuti-umum-2
// 2027: kabinet.gov.my/storage/2026/08/HKA_2027.pdf
const published: Record<number, Record<string, string>> = {
  2026: { "1 Shawwal": "03-21", "2 Shawwal": "03-22", "10 Dhu al-Hijjah": "05-27", Deepavali: "11-08" },
  2027: { "1 Shawwal": "03-10", "2 Shawwal": "03-11", "10 Dhu al-Hijjah": "05-17", Deepavali: "10-28" },
};
export type CompanyHoliday = { date: string; label: string; provisional: boolean; substituteFor?: string };
const nextDay = (day: string) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

export function addSubstituteDays(base: CompanyHoliday[]): CompanyHoliday[] {
  const sorted = [...base].sort((a, b) => a.date.localeCompare(b.date));
  const occupied = new Set(sorted.map(h => h.date));
  const seen = new Set<string>();
  const substitutes: CompanyHoliday[] = [];
  for (const h of sorted) {
    const collision = seen.has(h.date);
    seen.add(h.date);
    if (new Date(`${h.date}T00:00:00Z`).getUTCDay() !== 0 && !collision) continue;
    let date = nextDay(h.date);
    while (occupied.has(date) || new Date(`${date}T00:00:00Z`).getUTCDay() === 0) date = nextDay(date);
    occupied.add(date);
    substitutes.push({ ...h, date, label: `${h.label} · Replacement holiday`, substituteFor: h.date });
  }
  return [...sorted, ...substitutes].sort((a, b) => a.date.localeCompare(b.date));
}

export function companyHolidays(year: number): CompanyHoliday[] {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return [];
  const calendar = new Holidays("MY", "01", { languages: "en" });
  const rows: CompanyHoliday[] = [];
  for (const h of calendar.getHolidays(year)) {
    if (h.substitute) continue;
    const key = h.name === "Deepavali" ? "Deepavali" : h.rule;
    const label = key === "Deepavali" ? "Deepavali" : names[key];
    if (!label) continue;
    const override = published[year]?.[key];
    const date = override ? `${year}-${override}` : h.date.slice(0, 10);
    if (rows.some(row => row.date === date && row.label === label)) continue;
    rows.push({ date, label, provisional: !published[year] || ["1 Shawwal", "2 Shawwal", "10 Dhu al-Hijjah", "Deepavali"].includes(key) });
  }
  return addSubstituteDays(rows);
}

export function companyHolidayItems(month: string): CalendarItem[] {
  const year = Number(month.slice(0, 4));
  return [year - 1, year].flatMap(companyHolidays).filter(h => h.date.startsWith(`${month}-`)).map(h => ({
    id: `company-holiday-${h.date}-${h.label}`, date: h.date, time: "All day", label: h.label,
    detail: `KLG Company Holiday${h.substituteFor ? ` · In lieu of ${h.substituteFor}` : ""}${h.provisional ? " · Subject to confirmation / change" : ""}`,
    href: null, kind: "holiday", tone: "calendar-holiday",
  }));
}
