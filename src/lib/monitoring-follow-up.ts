export function malaysiaDate(value: Date | string = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function monitoringDueLabel(reviewAt: string | null, today: string) {
  if (!reviewAt) return "Review date required";
  const date = malaysiaDate(reviewAt);
  if (date === today) return "Today · Follow-up required";
  const days = Math.round((Date.parse(today) - Date.parse(date)) / 86400000);
  return `Overdue ${days} day${days === 1 ? "" : "s"}`;
}
