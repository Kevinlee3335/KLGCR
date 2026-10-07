import { describe, expect, it } from "vitest";
import { googleFormResponseUrl } from "./google-form-response-link";

describe("googleFormResponseUrl", () => {
  it("links legacy webhook rows to the matching Google Sheet row", () => {
    expect(googleFormResponseUrl("google_form", "spreadsheet-id:12345:27"))
      .toBe("https://docs.google.com/spreadsheets/d/spreadsheet-id/edit#gid=12345&range=A27");
  });

  it("links current Google Form response sources to their response sheet tab", () => {
    expect(googleFormResponseUrl("google_form", "gform-v2:spreadsheet-id:12345:10/7/2026 10:00:00:A101"))
      .toBe("https://docs.google.com/spreadsheets/d/spreadsheet-id/edit#gid=12345");
  });

  it("does not turn non-Google complaints into external links", () => {
    expect(googleFormResponseUrl("manual", "spreadsheet-id:12345:27")).toBeNull();
    expect(googleFormResponseUrl("google_form", "google:unknown")).toBeNull();
  });
});
