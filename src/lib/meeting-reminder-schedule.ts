// Malaysia is UTC+08:00 throughout the year.
export function meetingReminderSlot(now: Date) {
  const local = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const hour = local.getUTCHours();
  if (hour != 9) return null;
  return { date: local.toISOString().slice(0, 10), hour };
}
export function meetingIsUpcoming(startsAt: string, now: Date, date: string) {
  const start = new Date(startsAt);
  return Number.isFinite(start.getTime()) && start > now &&
    new Date(start.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) === date;
}

export function meetingReminderDue(startsAt: string, now: Date) {
  const date = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (!meetingIsUpcoming(startsAt, now, date)) return false;
  return Boolean(meetingReminderSlot(now));
}
