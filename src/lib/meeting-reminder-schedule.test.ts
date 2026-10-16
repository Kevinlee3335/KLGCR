import { describe, expect, it } from "vitest";
import { meetingIsUpcoming, meetingReminderSlot, meetingReminderDue } from "./meeting-reminder-schedule";
describe("meeting reminder schedule", () => {
  it.each([9, 13, 17, 21])("runs at %s MYT", hour => {
    expect(meetingReminderSlot(new Date(`2026-10-16T${String(hour).padStart(2, "0")}:00:00+08:00`))).toEqual({ date: "2026-10-16", hour });
  });
  it.each([0, 6, 8, 10, 11, 12, 14, 15, 16, 18, 23])("skips %s MYT", hour => {
    expect(meetingReminderSlot(new Date(`2026-10-16T${String(hour).padStart(2, "0")}:00:00+08:00`))).toBeNull();
  });
  it("stops at meeting start, irrespective of its end time", () => {
    const start = "2026-10-16T16:30:00+08:00";
    expect(meetingIsUpcoming(start, new Date("2026-10-16T15:00:00+08:00"), "2026-10-16")).toBe(true);
    expect(meetingIsUpcoming(start, new Date(start), "2026-10-16")).toBe(false);
    expect(meetingIsUpcoming(start, new Date("2026-10-16T18:00:00+08:00"), "2026-10-16")).toBe(false);
    expect(meetingIsUpcoming(start, new Date("2026-10-15T15:00:00+08:00"), "2026-10-15")).toBe(false);
  });
});

it("adds a single half-hour alert even before 9AM and avoids a duplicate at a regular slot", () => {
  expect(meetingReminderDue("2026-10-16T16:30:00+08:00", new Date("2026-10-16T16:00:15+08:00"))).toBe(true);
  expect(meetingReminderDue("2026-10-16T16:30:00+08:00", new Date("2026-10-16T16:01:00+08:00"))).toBe(false);
  expect(meetingReminderDue("2026-10-16T08:00:00+08:00", new Date("2026-10-16T07:30:00+08:00"))).toBe(true);
  expect(meetingReminderDue("2026-10-16T13:30:00+08:00", new Date("2026-10-16T13:00:00+08:00"))).toBe(true);
});
