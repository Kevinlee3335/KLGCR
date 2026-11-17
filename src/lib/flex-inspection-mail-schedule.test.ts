import { describe, expect, it } from "vitest";
import { flexInspectionSendDate, latestDueFlexInspectionPeriod } from "./flex-inspection-mail-schedule";

describe("Flex inspection mail schedule", () => {
  it.each([
    ["2026-12", "2026-12-07"],
    ["2026-11", "2026-11-07"],
    ["2027-03", "2027-03-06"],
    ["2027-02", "2027-02-05"],
  ])("schedules %s for %s", (period, date) => {
    expect(flexInspectionSendDate(period)).toBe(date);
  });

  it("keeps overdue periods eligible at the turn of the year", () => {
    expect(latestDueFlexInspectionPeriod("2027-01-01")).toBe("2026-12");
    expect(latestDueFlexInspectionPeriod("2027-01-07")).toBe("2027-01");
  });
});
