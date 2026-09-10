import { describe, expect, it } from "vitest";
import {
  appointmentRequired,
  appointmentTimeValues,
  normalizeRoomAccessPermission,
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

describe("appointment time slots", () => {
  it("contains only the five approved start times", () => {
    expect(appointmentTimeValues).toEqual(["09:30", "10:30", "13:00", "14:00", "15:00"]);
  });
});
