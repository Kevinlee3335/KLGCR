export type GoogleFormPayload = Record<string, unknown> & {
  namedValues?: Record<string, unknown>;
};

/** Google Sheets preserves punctuation and occasionally adds whitespace to headings. */
export function normalizeGoogleFormField(value: string) {
  return value.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9]/g, "");
}

export function googleFormValue(body: GoogleFormPayload, ...labels: string[]) {
  const sources = [body, body.namedValues].filter(Boolean) as Record<string, unknown>[];
  const wanted = new Set(labels.map(normalizeGoogleFormField));
  for (const source of sources) {
    const key = Object.keys(source).find((candidate) => wanted.has(normalizeGoogleFormField(candidate)));
    if (!key) continue;
    const raw = source[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const result = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
    if (result) return result;
  }
  return "";
}

export function googleFormDate(value: string) {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  // The response sheet used by KLGCR formats form dates as M/d/yyyy.
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  return null;
}

export function googleFormTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
  }
  if (hour > 23 || Number(match[2]) > 59) return null;
  return `${String(hour).padStart(2, "0")}:${match[2]}:00`;
}

export function roomAccessPermission(value: string): "yes" | "no" | null {
  if (/^(yes|true|1)$/i.test(value.trim())) return "yes";
  if (/^(no|false|0)$/i.test(value.trim())) return "no";
  return null;
}

export const preferredDateLabels = ["ROOM AVAILABILITY (DATE)", "Room Availability Date"];
export const preferredTimeLabels = ["ROOM AVAILABILITY (TIME)", "Room Availability Time"];
export const roomAccessLabels = [
  "REQUEST FOR ROOM ACCESS DUE TO TENANT'S UNAVAILABILITY",
  "Request For Room Access Due To Tenant’s Unavailability",
];
