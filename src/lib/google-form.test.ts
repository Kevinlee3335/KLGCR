import { describe, expect, it } from "vitest";
import { googleFormDate, googleFormTime, googleFormValue, roomAccessLabels, roomAccessPermission } from "./google-form";

describe("Google Form response mapping", () => {
  it("reads the actual KLGCR response-sheet headings", () => {
    const row = {
      "ROOM AVAILABILITY (DATE)": ["9/18/2026"],
      "ROOM AVAILABILITY (TIME)": ["2:30:00 PM"],
      "REQUEST FOR ROOM ACCESS DUE TO TENANT’S UNAVAILABILITY": ["YES"],
    };
    expect(googleFormDate(googleFormValue(row, "ROOM AVAILABILITY (DATE)")!)).toBe("2026-09-18");
    expect(googleFormTime(googleFormValue(row, "ROOM AVAILABILITY (TIME)")!)).toBe("14:30:00");
    expect(roomAccessPermission(googleFormValue(row, ...roomAccessLabels))).toBe("yes");
  });

  it("reads Apps Script namedValues and tolerates heading punctuation", () => {
    const event = { namedValues: { "Room Availability - Date": ["2026-09-19"] } };
    expect(googleFormValue(event, "ROOM AVAILABILITY (DATE)")).toBe("2026-09-19");
  });
});
