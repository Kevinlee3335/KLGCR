import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

const required = z.string().trim().min(1, "This field is required.").max(200);
export const registrationSchema = z.object({
  full_name: required, email: z.string().trim().toLowerCase().email().max(254),
  member_type: z.enum(["resident", "outsider"]), id_type: z.enum(["IC", "Passport"]),
  identification: required.transform(value => value.replace(/\s/g," ").toUpperCase()), gender: z.enum(["Male", "Female", "Other"]), nationality: required,
  room_no: required, student_id: required, address: required,
  emergency_contact: z.string().trim().min(5).max(40).regex(/^[+()0-9 .-]+$/), emergency_relationship: required,
});
export function membershipToken() { return randomBytes(32).toString("hex"); }
export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function validToken(token: string) { return /^[a-f0-9]{64}$/.test(token); }
export function appOrigin() {
  const value = process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_APP_URL;
  if (!value) throw new Error("NEXT_PUBLIC_APP_URL is required for membership links.");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("Membership URL must use HTTPS.");
  return url.origin;
}
export function receiptOptionalForTesting() { return process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development"; }
export function membershipEnabled() {
  const configured = process.env.KLGCR_MEMBERSHIP_ENABLED;
  if (configured === "false") return false;
  return configured === "true" || process.env.VERCEL_ENV === "preview";
}
export function malaysiaDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function reminderDates(now = new Date()) {
  const day = malaysiaDay(now);
  const [year, month, date] = day.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return { day, nextMonth: next, reminderDue: date >= last - 2 };
}
export function membershipFee(_type: string, _initial: boolean) { return 40; }
export function nextPeriod(expiry: string | null, today = malaysiaDay()) {
  const current = today.slice(0, 7) + "-01";
  if (!expiry || expiry < today) return current;
  const date = new Date(`${expiry}T12:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}
export function memberStatus(member: { status: string; expires_on: string | null }, today = malaysiaDay()) {
  if (member.status === "active" && member.expires_on && member.expires_on < today) return "Expired — block access card";
  return member.status.replaceAll("_", " ");
}
export async function receiptBytes(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || !file.size || file.size > 3 * 1024 * 1024) throw new Error("Upload a JPG, PNG or PDF receipt up to 3 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const pdf = bytes.subarray(0, 5).toString() === "%PDF-";
  const type = png ? "image/png" : jpg ? "image/jpeg" : pdf ? "application/pdf" : null;
  if (!type || type !== file.type) throw new Error("Upload a valid JPG, PNG or PDF receipt.");
  return { bytes, type, extension: png ? "png" : jpg ? "jpg" : "pdf" };
}
export function escapeHtml(value: string) { return value.replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!)); }

export function memberLink(token: string) { return `${appOrigin()}/membership/manage/${token}`; }

export function membershipEmailConfigured() {
 return Boolean((process.env.KLGCR_GMAIL_WEB_APP_URL && process.env.KLGCR_GMAIL_WEB_APP_SECRET) || (process.env.KLGCR_EMAIL_ENABLED === "true" && process.env.RESEND_API_KEY && process.env.KLGCR_EMAIL_FROM));
}
