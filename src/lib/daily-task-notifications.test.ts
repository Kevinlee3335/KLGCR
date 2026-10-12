import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), admins: vi.fn(), profile: vi.fn() }));
vi.mock("@/lib/app-notifications", () => ({ createAppNotifications: mocks.create, notifyActiveAdmins: mocks.admins }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ maybeSingle: mocks.profile }) }) }) }) }) }) }));
import { notifyDailyTaskAssigned, notifyDailyTaskCompleted } from "./daily-task-notifications";
beforeEach(() => { vi.clearAllMocks(); });
describe("daily task notifications", () => {
  it.each(["admin", "operation", "housekeeping"])("notifies Admin after %s completion", async (category) => {
    await notifyDailyTaskCompleted({ id: 42, title: "Check lobby", status: "in_progress", task_date: "2026-10-12", task_category: category }, "Faiz");
    expect(mocks.admins).toHaveBeenCalledWith(expect.objectContaining({ type: "daily_task_completed", body: "Faiz completed: Check lobby", href: `/admin/daily-tasks?date=2026-10-12&category=${category}`, entityId: null }));
  });
  it("does not notify again for an already completed task", async () => {
    await notifyDailyTaskCompleted({ id: 42, title: "Check lobby", status: "completed", task_date: "2026-10-12", task_category: "operation" }, "Kevin");
    expect(mocks.admins).not.toHaveBeenCalled();
  });
  it.each([["admin", "/admin/daily-tasks?date=2026-10-12&category=operation"], ["cleaner", "/staff/daily-tasks/42"], ["maintenance_staff", "/staff/daily-tasks/42"]])("routes assignments to the correct %s page", async (role, href) => {
    mocks.profile.mockResolvedValue({ data: { role }, error: null });
    await notifyDailyTaskAssigned({ recipientId: "user-1", title: "Check lobby", date: "2026-10-12", category: "operation", taskId: 42, reminder: true });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ recipientIds: ["user-1"], href, title: "Daily task due today", entityId: null }));
  });
});
