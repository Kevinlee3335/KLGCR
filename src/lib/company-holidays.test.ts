import { describe, expect, it } from "vitest";
import { addSubstituteDays, companyHolidays, companyHolidayItems } from "./company-holidays";
describe("company public holidays", () => {
  it("keeps the company 12 days and replaces Sunday Deepavali on Monday", () => {
    const days = companyHolidays(2026);
    expect(days.filter(h => !h.substituteFor)).toHaveLength(12);
    expect(days.find(h => h.date === "2026-11-09")?.substituteFor).toBe("2026-11-08");
    expect(days.find(h => h.date === "2026-03-24")?.substituteFor).toBe("2026-03-22");
    expect(days.some(h => /Wesak|Thaipusam|Ramadan|Muharram/.test(h.label))).toBe(false);
  });
  it("uses the published 2027 dates instead of the library's earlier Islamic predictions", () => {
    const days = companyHolidays(2027);
    for (const date of ["2027-03-10", "2027-03-11", "2027-05-17", "2027-10-28"]) expect(days.some(h => h.date === date && !h.substituteFor)).toBe(true);
    expect(days.filter(h => !h.substituteFor)).toHaveLength(12);
    expect(days.some(h => h.date === "2027-05-03")).toBe(false);
    expect(days.find(h => h.date === "2027-02-08")?.substituteFor).toBe("2027-02-07");
  });
  it("advances past consecutive holidays and handles cross-year substitutes", () => {
    const result = addSubstituteDays([{date:"2028-12-31",label:"Sunday",provisional:false},{date:"2029-01-01",label:"Monday",provisional:false}]);
    expect(result.find(h => h.substituteFor)?.date).toBe("2029-01-02");
  });
  it("generates future years provisionally and filters the month", () => {
    expect(companyHolidays(2028).filter(h => !h.substituteFor)).toHaveLength(12);
    expect(companyHolidays(2028).every(h => h.provisional)).toBe(true);
    expect(companyHolidayItems("2026-11").map(h => h.date)).toEqual(["2026-11-08", "2026-11-09"]);
  });
});
