import { describe, expect, it } from "vitest";
import { formValue, roomAccessPermission, roomAvailability, toDatabaseTime, toIsoDate } from "./google-form";

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

describe("Google Form room availability", () => {
  it("requires a date and time when room access is denied", () => {
    expect(roomAvailability({ accessRequest: "NO", date: "09/18/2026", time: "01.00 PM - 02.00 PM" })).toEqual({
      accessPermission: "no",
      availabilityDate: "2026-09-18",
      availabilityTime: "01.00 PM - 02.00 PM",
    });
    expect(roomAvailability({ accessRequest: "NO", date: "", time: "" })).toBeNull();
  });

  it("allows both availability fields to be blank when room access is granted", () => {
    expect(roomAvailability({ accessRequest: "YES", date: "", time: "" })).toEqual({
      accessPermission: "yes",
      availabilityDate: null,
      availabilityTime: null,
    });
  });

  it("preserves a supplied time range while normalizing its date", () => {
    expect(roomAvailability({ accessRequest: "YES", date: "09/19/2026", time: "03.00 PM - 04.30 PM" })).toEqual({
      accessPermission: "yes",
      availabilityDate: "2026-09-19",
      availabilityTime: "03.00 PM - 04.30 PM",
    });
  });

  it.each([
    { accessRequest: "YES", date: "09/19/2026", time: "" },
    { accessRequest: "YES", date: "", time: "03.00 PM - 04.30 PM" },
  ])("rejects a partial availability pair", (value) => {
    expect(roomAvailability(value)).toBeNull();
  });

  it.each(["", "MAYBE"])("rejects missing or invalid room access: %j", (accessRequest) => {
    expect(roomAvailability({ accessRequest, date: "", time: "" })).toBeNull();
  });
});
