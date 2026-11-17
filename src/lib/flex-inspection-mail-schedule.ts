import { isJohorPublicHoliday } from "@/lib/company-holidays";

export function flexInspectionSendDate(period: string) {
  const seventh = `${period}-07`;
  if (new Date(seventh).getUTCDay() !== 0) return seventh;

  const saturday = `${period}-06`;
  return isJohorPublicHoliday(saturday) ? `${period}-05` : saturday;
}

export function latestDueFlexInspectionPeriod(today: string) {
  const period = today.slice(0, 7);
  if (today >= flexInspectionSendDate(period)) return period;

  const previousMonth = new Date(`${period}-01`);
  previousMonth.setUTCDate(0);
  return previousMonth.toISOString().slice(0, 7);
}
