import { expect, it } from "vitest";
import { resolveDailyTaskCategory } from "./daily-tasks";
it.each([["cleaner","housekeeping"],["maintenance_staff","operation"],["admin","admin"],["management_viewer","admin"]])("defaults new %s employees", (role, expected) => {
  expect(resolveDailyTaskCategory({role})).toBe(expected);
});
it("preserves an explicit department even when it differs from the login role", () => {
  expect(resolveDailyTaskCategory({role:"maintenance_staff",daily_task_category:"housekeeping"})).toBe("housekeeping");
});
it("rejects unknown roles without a valid department", () => {
  expect(resolveDailyTaskCategory({role:"unknown"})).toBeNull();
});
