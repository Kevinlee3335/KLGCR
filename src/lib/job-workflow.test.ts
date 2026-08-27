import { describe, expect, it } from "vitest";
import { availableJobActions } from "./job-workflow";

describe("availableJobActions", () => {
  it("does not show close-out actions before a job starts", () => expect(availableJobActions("assigned")).toEqual(["start"]));
  it("offers all Phase 3 outcomes for in-progress work", () => expect(availableJobActions("in_progress")).toEqual(["complete", "monitor", "pending_material"]));
  it("allows monitored work to be updated or completed", () => expect(availableJobActions("under_monitoring")).toEqual(["complete", "monitor"]));
  it("allows pending-material work to resume or complete", () => expect(availableJobActions("pending_material")).toEqual(["resume", "complete"]));
  it("offers no staff mutation for terminal statuses", () => expect(availableJobActions("completed")).toEqual([]));
});
