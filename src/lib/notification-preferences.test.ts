import { describe, expect, it } from "vitest";
import { phoneNotificationEnabled, taskPushKey } from "./notification-preferences";
describe("phone preference rules", () => {
  it("preserves original delivery for users without settings", () => expect(phoneNotificationEnabled(undefined, "job_assigned")).toBe(true));
  it("keeps event switches independent and honors the master switch", () => {
    const preference = { user_id: "a", enabled: true, events: { daily_task_reminder: false } };
    expect(phoneNotificationEnabled(preference, "daily_task_reminder")).toBe(false);
    expect(phoneNotificationEnabled(preference, "job_assigned")).toBe(true);
    expect(phoneNotificationEnabled({...preference, enabled: false}, "job_assigned")).toBe(false);
  });
  it("separates Admin, Operation and Housekeeping categories", () => {
    expect(taskPushKey("admin", "assigned")).toBe("admin_task_assigned");
    expect(taskPushKey("operation", "completed")).toBe("operation_task_completed");
    expect(taskPushKey("housekeeping", "assigned")).toBe("housekeeping_task_assigned");
    expect(taskPushKey(null, "assigned")).toBe("daily_task_assigned");
  });
});
