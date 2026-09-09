import { describe, expect, it } from "vitest";
import { appointmentRequired, appointmentTimeValues } from "./appointments";

describe("appointmentRequired", () => {
  it("does not require an appointment when room access is granted", () => {
    expect(appointmentRequired("yes")).toBe(false);
  });

  it("requires an appointment when room access is denied or unknown", () => {
    expect(appointmentRequired("no")).toBe(true);
    expect(appointmentRequired(null)).toBe(true);
  });
});

describe("appointment time slots", () => {
  it("contains only the five approved start times", () => {
    expect(appointmentTimeValues).toEqual(["09:30", "10:30", "13:00", "14:00", "15:00"]);
  });
});
