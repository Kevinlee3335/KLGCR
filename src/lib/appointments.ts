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

/** V2 has one workflow decision: an appointment is required only without access. */
export function appointmentRequired(roomAccess: string | null | undefined) {
  return roomAccess?.toLowerCase() !== "yes";
}
