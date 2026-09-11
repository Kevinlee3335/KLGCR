import { describe, expect, it } from "vitest";
import {
  appointmentRequired,
  complaintAppointmentRequired,
  appointmentTimeValues,
  normalizeRoomAccessPermission,
  validateAppointmentSelection,
} from "./appointments";

describe("normalizeRoomAccessPermission", () => {
  it("trims and normalizes supported answers", () => {
    expect(normalizeRoomAccessPermission(" YES ")).toBe("yes");
    expect(normalizeRoomAccessPermission("\tNo\n")).toBe("no");
  });

  it("keeps null and legacy answers in the safe unknown state", () => {
    expect(normalizeRoomAccessPermission(null)).toBeNull();
    expect(normalizeRoomAccessPermission("enter_with_permission")).toBeNull();
  });
});

describe("appointmentRequired", () => {
  it("does not require an appointment when room access is granted", () => {
    expect(appointmentRequired("yes")).toBe(false);
    expect(appointmentRequired(" YES ")).toBe(false);
  });

  it("requires an appointment when room access is denied or unknown", () => {
    expect(appointmentRequired("no")).toBe(true);
    expect(appointmentRequired(" No ")).toBe(true);
    expect(appointmentRequired(null)).toBe(true);
    expect(appointmentRequired("legacy value")).toBe(true);
  });
});

describe("complaintAppointmentRequired", () => {
  it("makes scheduling optional for manual complaints without requiring room access", () => {
    expect(complaintAppointmentRequired("manual", null)).toBe(false);
    expect(complaintAppointmentRequired("manual", "no")).toBe(false);
  });

  it("preserves Google Form access rules", () => {
    expect(complaintAppointmentRequired("google_form", "no")).toBe(true);
    expect(complaintAppointmentRequired("google_form", "yes")).toBe(false);
  });

  it("keeps unknown and other complaint sources on the existing safe rule", () => {
    expect(complaintAppointmentRequired("other", null)).toBe(true);
    expect(complaintAppointmentRequired(undefined, "yes")).toBe(false);
  });
});

describe("appointment time slots", () => {
  it("contains only the five approved start times", () => {
    expect(appointmentTimeValues).toEqual(["09:30", "10:30", "13:00", "14:00", "15:00"]);
  });
});

describe("approval appointment validation", () => {
  it("allows a manual job without creating an appointment", () => {
    expect(validateAppointmentSelection("", "", complaintAppointmentRequired("manual", null))).toEqual({ success: true, appointment: null });
  });

  it("creates a manual appointment only when both values are supplied", () => {
    expect(validateAppointmentSelection("2026-09-12", "09:30", complaintAppointmentRequired("manual", null))).toEqual({
      success: true,
      appointment: { appointmentDate: "2026-09-12", appointmentTime: "09:30" },
    });
  });

  it.each([["2026-09-12", ""], ["", "09:30"]])("rejects a manual appointment with only one value", (date, time) => {
    expect(validateAppointmentSelection(date, time, complaintAppointmentRequired("manual", null))).toEqual({
      success: false,
      error: "Maintenance Date and Maintenance Time must either both be provided or both be blank.",
    });
  });
  it("allows access-granted job creation without an appointment", () => {
    expect(validateAppointmentSelection("", "", false)).toEqual({ success: true, appointment: null });
  });

  it("creates an appointment selection for access-granted approval when both values are supplied", () => {
    expect(validateAppointmentSelection("2026-09-12", "09:30", false)).toEqual({
      success: true,
      appointment: { appointmentDate: "2026-09-12", appointmentTime: "09:30" },
    });
  });

  it.each([["2026-09-12", ""], ["", "09:30"]])("rejects an incomplete optional appointment", (date, time) => {
    expect(validateAppointmentSelection(date, time, false).success).toBe(false);
  });

  it("rejects access-denied job creation without an appointment", () => {
    expect(validateAppointmentSelection("", "", true).success).toBe(false);
  });

  it("creates an appointment selection for access-denied approval when both values are supplied", () => {
    expect(validateAppointmentSelection("2026-09-12", "10:30", true).success).toBe(true);
  });
});
