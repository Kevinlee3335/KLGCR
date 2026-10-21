export const WASTE_BUCKET = 'waste-collection';
export function malaysiaDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function scheduleDates(month: string, text: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Select a valid month.');
  const dates = [...new Set(text.split(/[\s,;]+/).filter(Boolean).map(value => /^\d{1,2}$/.test(value) ? `${month}-${value.padStart(2, '0')}` : value))].sort();
  if (!dates.length || dates.some(date => !validDate(date) || !date.startsWith(month + '-'))) throw new Error('Enter collection dates within the selected month, e.g. 2, 5, 9 or YYYY-MM-DD.');
  return dates;
}
export function collectionStatus(plannedDate: string, deadline: string | null, actual: string | null, now = new Date()) {
  const due = new Date(`${plannedDate}T${deadline || '23:59:59'}+08:00`);
  if (actual) return new Date(actual) > due ? 'Delayed' : 'Completed';
  return now > due ? 'No record — confirm with Security' : 'Scheduled';
}
