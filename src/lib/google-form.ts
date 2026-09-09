export type GoogleFormPayload = Record<string, unknown> & {
  namedValues?: Record<string, unknown>;
  source_reference?: unknown;
};

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalizedKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** Reads both flattened Apps Script payloads and the native e.namedValues shape. */
export function formValue(body: GoogleFormPayload, ...labels: string[]) {
  const sources: Record<string, unknown>[] = [body];
  if (body.namedValues && typeof body.namedValues === "object" && !Array.isArray(body.namedValues)) {
    sources.unshift(body.namedValues);
  }

  const wanted = new Set(labels.map(normalizedKey));
  for (const source of sources) {
    const match = Object.entries(source).find(([key]) => wanted.has(normalizedKey(key)));
    const value = text(match?.[1]);
    if (value) return value;
  }
  return "";
}

export function toIsoDate(value: string) {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  // Google Sheets normally serializes form dates according to its US-style
  // script locale. ISO is recommended when a locale-independent date is needed.
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  return null;
}

export function toDatabaseTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const suffix = match[4]?.toUpperCase();
  if (hour > (suffix ? 12 : 23)) return null;
  if (suffix) hour = hour % 12 + (suffix === "PM" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${match[2]}:${match[3] ?? "00"}`;
}

export function roomAccessPermission(value: string): "yes" | "no" | null {
  const answer = value.trim().toLowerCase();
  if (/^(yes|true|1)\b/.test(answer)) return "yes";
  if (/^(no|false|0)\b/.test(answer)) return "no";
  return null;
}
