import { expect, it } from "vitest";
import { showDailyTaskInDefaultList } from "./daily-task-filters";
it.each(["pending", "accepted", "in_progress", "kiv"])("retains unfinished %s tasks", status => {
  expect(showDailyTaskInDefaultList({ status }, "2026-10-16")).toBe(true);
});
it("hides yesterday's completed tasks but keeps today's, using Malaysia midnight", () => {
  expect(showDailyTaskInDefaultList({status:"completed",completed_at:"2026-10-15T15:59:59Z"}, "2026-10-16")).toBe(false);
  expect(showDailyTaskInDefaultList({status:"completed",completed_at:"2026-10-15T16:00:00Z"}, "2026-10-16")).toBe(true);
  expect(showDailyTaskInDefaultList({status:"completed",completed_at:"2026-10-14T08:53:00Z"}, "2026-10-16")).toBe(false);
});
it("keeps undated legacy completions in history only", () => {
  expect(showDailyTaskInDefaultList({status:"completed",completed_at:null}, "2026-10-16")).toBe(false);
});
