import { describe, expect, it } from "vitest";
import { dateRange, summarize } from "./complaint-summary";

describe("complaint report summary", () => {
  it("counts a room once and completes a report only when all its defects are done", () => {
    const complaints = [
      { id: "a", block_id: 1, room_no: "201", status: "assigned" },
      { id: "b", block_id: 1, room_no: "201", status: "assigned" },
      { id: "c", block_id: 2, room_no: "201", status: "new" },
    ];
    const jobs = [
      { id: "1", complaint_id: "a", status: "completed" },
      { id: "2", complaint_id: "a", status: "pending_material" },
      { id: "3", complaint_id: "b", status: "completed" },
    ];
    const result = summarize(complaints, jobs, []);
    expect(result).toMatchObject({ total: 3, rooms: 2, completed: 1, completedRooms: 0, pendingMaterial: 1, pending: 1, completionRate: 33.3 });
  });

  it("keeps only the latest appointment outcome for tenant availability", () => {
    const complaints = [{ id: "a", block_id: 1, room_no: "101", status: "assigned" }];
    const jobs = [{ id: "1", complaint_id: "a", status: "assigned" }];
    expect(summarize(complaints, jobs, [
      { job_id: "1", status: "no_show", created_at: "2026-09-03T00:00:00Z" },
      { job_id: "1", status: "confirmed", created_at: "2026-09-04T00:00:00Z" },
    ]).tenantUnavailable).toBe(0);
    expect(summarize(complaints, jobs, [
      { job_id: "1", status: "confirmed", created_at: "2026-09-03T00:00:00Z" },
      { job_id: "1", status: "no_show", created_at: "2026-09-04T00:00:00Z" },
    ]).tenantUnavailable).toBe(1);
  });

  it("uses inclusive Malaysia calendar days and rejects reversed ranges", () => {
    expect(dateRange("2026-09-01", "2026-09-24", "2026-09-24")).toMatchObject({
      startUtc: "2026-09-01T00:00:00+08:00", endUtc: "2026-09-25T00:00:00+08:00",
    });
    expect(dateRange("2026-09-25", "2026-09-24", "2026-09-24").error).toBeTruthy();
  });
});
