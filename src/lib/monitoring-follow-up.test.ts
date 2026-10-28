import { describe, expect, it } from "vitest";
import { malaysiaDate, monitoringDueLabel } from "./monitoring-follow-up";

describe("monitoring follow-up dates", () => {
  it("uses the Malaysian calendar day at midnight", () => {
    expect(malaysiaDate("2026-10-27T16:00:00Z")).toBe("2026-10-28");
    expect(monitoringDueLabel("2026-10-28T15:59:00Z", "2026-10-28")).toBe("Today · Follow-up required");
    expect(monitoringDueLabel("2026-10-27T00:00:00+08:00", "2026-10-28")).toBe("Overdue 1 day");
    expect(monitoringDueLabel(null, "2026-10-28")).toBe("Review date required");
  });
});
