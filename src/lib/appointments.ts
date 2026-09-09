export const appointmentStatuses = [
  "pending_confirmation",
  "confirmed",
  "completed",
  "cancelled",
  "rescheduled",
  "no_show",
] as const;

export type RoomAccessPermission = "yes" | "no";

export const titleCase = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

/** V3 has one workflow decision: only an explicit YES grants access without an appointment. */
export function appointmentRequired(roomAccess: string | null | undefined) {
  return roomAccess?.trim().toLowerCase() !== "yes";
}
