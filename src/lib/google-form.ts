export type GoogleFormPayload = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

const normalizedKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Read a Google Forms answer without depending on capitalization or punctuation. */
export function formValue(body: GoogleFormPayload, ...labels: string[]) {
  const values = new Map(Object.entries(body).map(([key, value]) => [normalizedKey(key), text(value)]));
  for (const label of labels) {
    const value = values.get(normalizedKey(label));
    if (value) return value;
  }
  return "";
}

export function toIsoDate(value: string) {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  // Google Sheets emits US-style dates for the response sheet used by KLGCR.
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  return null;
}

/** Convert Google Forms' 12/24-hour display values to a PostgreSQL time value. */
export function toIsoTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > (match[3] ? 12 : 23) || hour < (match[3] ? 1 : 0)) return null;
  if (match[3]) hour = (hour % 12) + (match[3].toLowerCase() === "pm" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${match[2]}:00`;
}

export function roomAccessPermission(value: string): "yes" | "no" | null {
  if (/^(yes|true|1)$/i.test(value.trim())) return "yes";
  if (/^(no|false|0)$/i.test(value.trim())) return "no";
  return null;
}

export function studentAvailability(body: GoogleFormPayload) {
  const preferredDate = toIsoDate(formValue(body,
    "preferred_date", "Preferred Date", "Room Availability Date", "ROOM AVAILABILITY (DATE)"));
  const preferredTime = toIsoTime(formValue(body,
    "preferred_time", "Preferred Time", "Room Availability Time", "ROOM AVAILABILITY (TIME)"));
  const permission = roomAccessPermission(formValue(body,
    "room_access_permission", "Room Access Permission", "Request For Room Access Due To Tenant's Unavailability"));
  return { preferredDate, preferredTime, permission };
}
