import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createAppNotifications = vi.fn();
  const profileQuery = {
    select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn(),
  };
  const taskQuery = {
    insert: vi.fn(), select: vi.fn(), single: vi.fn(),
  };
  Object.values(profileQuery).forEach((method) => vi.mocked(method).mockReturnValue(profileQuery as never));
  profileQuery.maybeSingle.mockResolvedValue({ data: { id: "staff-id", daily_task_category: "operation" }, error: null });
  Object.values(taskQuery).forEach((method) => vi.mocked(method).mockReturnValue(taskQuery as never));
  taskQuery.single.mockResolvedValue({ data: { id: 42 }, error: null });
  return { createAppNotifications, profileQuery, taskQuery };
});

vi.mock("@/lib/auth", () => ({
  requireRole: vi.fn().mockResolvedValue({ id: "admin-id", role: "admin" }),
}));
vi.mock("@/lib/app-notifications", () => ({ createAppNotifications: mocks.createAppNotifications }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn((table: string) => table === "profiles" ? mocks.profileQuery : mocks.taskQuery),
  }),
}));

import { POST } from "./route";

describe("Daily Task assignment notification", () => {
  it("does not put a numeric daily task ID into the UUID notification entity field", async () => {
    const form = new URLSearchParams({
      action: "admin_task_create",
      title: "Check pump room",
      date: "2026-10-08",
      assignedTo: "staff-id",
      frequency: "once",
    });

    const response = await POST(new Request("https://klgcr.example/admin/daily-tasks/action", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form }));

    expect(response.status).toBe(303);
    expect(mocks.createAppNotifications).toHaveBeenCalledWith(expect.objectContaining({
      recipientIds: ["staff-id"],
      type: "daily_task_assigned",
      entityId: null,
    }));
  });
});
