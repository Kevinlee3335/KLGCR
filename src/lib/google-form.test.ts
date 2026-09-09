import { describe, expect, it } from "vitest";
import { formValue, roomAccessPermission, toDatabaseTime, toIsoDate } from "./google-form";

describe("Google Form payload normalization", () => {
  it("reads Google Apps Script namedValues arrays", () => {
    const payload = { namedValues: {
      "ROOM AVAILABILITY (DATE)": ["09/18/2026"],
      "ROOM AVAILABILITY (TIME)": ["2:30 PM"],
      "REQUEST FOR ROOM ACCESS DUE TO TENANT’S UNAVAILABILITY": ["YES, staff may enter"],
    } };

    expect(toIsoDate(formValue(payload, "ROOM AVAILABILITY (DATE)"))).toBe("2026-09-18");
    expect(toDatabaseTime(formValue(payload, "ROOM AVAILABILITY (TIME)"))).toBe("14:30:00");
    expect(roomAccessPermission(formValue(payload, "REQUEST FOR ROOM ACCESS DUE TO TENANT'S UNAVAILABILITY"))).toBe("yes");
  });

  it("keeps flattened payload support and recognizes an explicit NO", () => {
    const payload = { " preferred---DATE ": "2026-09-19", "Preferred_Time!!!": ["09:15"] };
    expect(toIsoDate(formValue(payload, "Preferred Date"))).toBe("2026-09-19");
    expect(toDatabaseTime(formValue(payload, "Preferred Time"))).toBe("09:15:00");
    expect(roomAccessPermission("NO - tenant will be present")).toBe("no");
  });

  it("does not silently turn a missing permission into a denial", () => {
    expect(roomAccessPermission("")).toBeNull();
    expect(toDatabaseTime("not a time")).toBeNull();
  });
});
