import { describe, expect, it } from "vitest";
import { appointmentRequired } from "./appointments";

describe("appointmentRequired", () => {
  it("does not require an appointment when room access is granted", () => {
    expect(appointmentRequired("yes")).toBe(false);
    expect(appointmentRequired(" YES ")).toBe(false);
  });

  it("requires an appointment when room access is denied or unknown", () => {
    expect(appointmentRequired("no")).toBe(true);
    expect(appointmentRequired(null)).toBe(true);
  });
});
