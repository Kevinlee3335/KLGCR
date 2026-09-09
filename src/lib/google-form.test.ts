import { describe, expect, it } from "vitest";
import { studentAvailability, toIsoTime } from "./google-form";

describe("Google Form student availability mapping", () => {
  it("maps the explicit form field names", () => {
    expect(studentAvailability({
      "Preferred Date": "09/15/2026",
      "Preferred Time": "3:30 PM",
      "Room Access Permission": "YES",
    })).toEqual({ preferredDate: "2026-09-15", preferredTime: "15:30:00", permission: "yes" });
  });

  it("maps snake-case webhook keys and a NO response", () => {
    expect(studentAvailability({
      preferred_date: "2026-09-16",
      preferred_time: "09:05",
      room_access_permission: "NO",
    })).toEqual({ preferredDate: "2026-09-16", preferredTime: "09:05:00", permission: "no" });
  });

  it("still maps the deployed legacy question labels", () => {
    expect(studentAvailability({
      "ROOM AVAILABILITY (DATE)": "09/17/2026",
      "ROOM AVAILABILITY (TIME)": "10:15:00 AM",
      "REQUEST FOR ROOM ACCESS DUE TO TENANT'S UNAVAILABILITY": "Yes",
    })).toEqual({ preferredDate: "2026-09-17", preferredTime: "10:15:00", permission: "yes" });
  });

  it("rejects malformed times rather than writing an invalid database value", () => {
    expect(toIsoTime("25:00")).toBeNull();
  });
});
