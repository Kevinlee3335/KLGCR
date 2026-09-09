export const appointmentStatuses = [
  "pending_confirmation",
  "confirmed",
  "completed",
  "cancelled",
  "rescheduled",
  "no_show",
] as const;

export const appointmentTimeSlots = [
  { value: "09:30", label: "09:30 AM – 10:30 AM" },
  { value: "10:30", label: "10:30 AM – 11:30 AM" },
  { value: "13:00", label: "01:00 PM – 02:00 PM" },
  { value: "14:00", label: "02:00 PM – 03:00 PM" },
  { value: "15:00", label: "03:00 PM – 04:30 PM" },
] as const;

export const appointmentTimeValues = appointmentTimeSlots.map(({ value }) => value) as [
  "09:30",
  "10:30",
  "13:00",
  "14:00",
  "15:00",
];

export type RoomAccessPermission = "yes" | "no";

export const titleCase = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

/** V2 has one workflow decision: an appointment is required only without access. */
export function appointmentRequired(roomAccess: string | null | undefined) {
  return roomAccess?.toLowerCase() !== "yes";
}
