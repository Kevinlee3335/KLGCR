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

export function normalizeRoomAccessPermission(
  roomAccess: string | null | undefined,
): RoomAccessPermission | null {
  const normalized = roomAccess?.trim().toLowerCase();
  return normalized === "yes" || normalized === "no" ? normalized : null;
}

export const titleCase = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

/** V2 has one workflow decision: an appointment is required only without access. */
export function appointmentRequired(roomAccess: string | null | undefined) {
  return normalizeRoomAccessPermission(roomAccess) !== "yes";
}

/** Only Google Form complaints use room access to determine whether scheduling is required. */
export function complaintAppointmentRequired(
  source: string | null | undefined,
  roomAccess: string | null | undefined,
) {
  return source === "google_form" ? appointmentRequired(roomAccess) : false;
}

export type AppointmentSelection =
  | { success: true; appointment: null }
  | { success: true; appointment: { appointmentDate: string; appointmentTime: (typeof appointmentTimeValues)[number] } }
  | { success: false; error: string };

/** Validate approval scheduling without consulting or changing preferred availability. */
export function validateAppointmentSelection(
  appointmentDate: FormDataEntryValue | null,
  appointmentTime: FormDataEntryValue | null,
  required: boolean,
): AppointmentSelection {
  const date = typeof appointmentDate === "string" ? appointmentDate.trim() : "";
  const time = typeof appointmentTime === "string" ? appointmentTime.trim() : "";
  if (!date && !time) {
    return required
      ? { success: false, error: "Select a Maintenance Date and Maintenance Time before approving the job." }
      : { success: true, appointment: null };
  }
  if (!date || !time) {
    return { success: false, error: "Maintenance Date and Maintenance Time must either both be provided or both be blank." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !appointmentTimeValues.includes(time as (typeof appointmentTimeValues)[number])) {
    return { success: false, error: "Select a valid Maintenance Date and Maintenance Time." };
  }
  return { success: true, appointment: { appointmentDate: date, appointmentTime: time as (typeof appointmentTimeValues)[number] } };
}

/** Apply source-specific room-access rules before validating the optional schedule pair. */
export function validateComplaintAppointmentSelection(
  source: string | null | undefined,
  roomAccess: string | null | undefined,
  appointmentDate: FormDataEntryValue | null,
  appointmentTime: FormDataEntryValue | null,
): AppointmentSelection {
  if (source === "google_form" && normalizeRoomAccessPermission(roomAccess) === null) {
    return { success: false, error: "Room access permission must be YES or NO." };
  }

  return validateAppointmentSelection(
    appointmentDate,
    appointmentTime,
    complaintAppointmentRequired(source, roomAccess),
  );
}

/** Use the tenant's selected slot as a draft appointment when access is denied. */
export function preferredAppointmentSelection(
  source: string | null | undefined,
  roomAccess: string | null | undefined,
  preferredDate: string | null | undefined,
  preferredTime: string | null | undefined,
) {
  if (!complaintAppointmentRequired(source, roomAccess) || !preferredDate || !preferredTime) return null;
  const date = preferredDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const match = preferredTime.trim().match(/^(\d{1,2})[.:](\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = match[3]?.toUpperCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (meridiem === "PM" ? 12 : 0);
  }
  const time = `${String(hour).padStart(2, "0")}:${minute}`;
  if (!appointmentTimeValues.includes(time as (typeof appointmentTimeValues)[number])) return null;
  return { date, time };
}
