import { malaysiaDate } from "./monitoring-follow-up";

export function checkoutDateLabel(date: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(`${date}T12:00:00+08:00`));
}

export function canStartAfterCheckout(date?: string | null, today = malaysiaDate()) {
  return Boolean(date && date <= today);
}
