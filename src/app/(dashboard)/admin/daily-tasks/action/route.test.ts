import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createAppNotifications = vi.fn();
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const profileQuery = {
    select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn(),
  };
  const taskQuery = {
    insert: vi.fn(), select: vi.fn(), single: vi.fn(),
  };
  Object.values(profileQuery).forEach((method) => vi.mocked(method).mockReturnValue(profileQuery as never));
  profileQuery.maybeSingle.mockResolvedValue({ data: { id: "staff-id", daily_task_category: "operation", role: "maintenance_staff" }, error: null });
  Object.values(taskQuery).forEach((method) => vi.mocked(method).mockReturnValue(taskQuery as never));
  taskQuery.single.mockResolvedValue({ data: { id: 42 }, error: null });
  return { createAppNotifications, profileQuery, taskQuery, rpc };
});

vi.mock("@/lib/auth", () => ({
  requireRole: vi.fn().mockResolvedValue({ id: "admin-id", role: "admin" }),
}));
vi.mock("@/lib/app-notifications", () => ({ createAppNotifications: mocks.createAppNotifications }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => mocks.profileQuery }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    rpc: mocks.rpc,
    from: vi.fn((table: string) => table === "profiles" ? mocks.profileQuery : mocks.taskQuery),
  }),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.taskQuery.insert.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.profileQuery.maybeSingle.mockResolvedValue({ data: { id: "staff-id", daily_task_category: "operation", role: "maintenance_staff" }, error: null });
});

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

const employees = [
  ["NANCY", "cleaner", null, "housekeeping"],
  ["Nouril", "admin", "admin", "admin"],
  ["Syafiqa", "admin", null, "admin"],
  ["KEVIN LEE", "admin", null, "operation"],
  ["Fikri", "admin", null, "operation"],
  ["Abdullah", "maintenance_staff", null, "operation"],
  ["Faiz", "maintenance_staff", "operation", "operation"],
  ["Ariffin", "cleaner", "housekeeping", "housekeeping"],
  ["FADHIL", "cleaner", "housekeeping", "housekeeping"],
  ["georgiannaanakmawong", "cleaner", "housekeeping", "housekeeping"],
  ["James", "admin", "admin", "admin"],
  ["MARY TAN", "admin", "admin", "admin"],
  ["ZALEHA", "cleaner", "housekeeping", "housekeeping"],
  ["test", "maintenance_staff", "housekeeping", "housekeeping"],
] as const;

describe.each(["once", "weekly", "biweekly", "monthly"])("%s assignment", (frequency) => {
  it.each(employees)("assigns %s to the correct department", async (full_name, role, daily_task_category, category) => {
    mocks.profileQuery.maybeSingle.mockResolvedValue({ data: { id: "staff-id", full_name, role, daily_task_category }, error: null });
    const form = new URLSearchParams({ action: "admin_task_create", title: "Department regression", date: "2026-10-14", assignedTo: "staff-id", frequency, dayNumber: "3", monthlyDate: "2026-10-14", taskCategory: "wrong-client-category" });
    const response = await POST(new Request("https://klgcr.example/admin/daily-tasks/action", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form }));
    expect(response.headers.get("location")).toBe(`https://klgcr.example/admin/daily-tasks?date=2026-10-14&category=${category}`);
    expect(mocks.taskQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ assigned_to: "staff-id", task_category: category }));
    expect(mocks.createAppNotifications).toHaveBeenCalledWith(expect.objectContaining({ recipientIds: ["staff-id"], type: "daily_task_assigned" }));
    if (frequency !== "once") expect(mocks.rpc).toHaveBeenCalledWith("materialize_recurring_tasks", { p_date: "2026-10-14" });
  });
});

it.each([
  { data: null, error: null },
  { data: null, error: { message: "permission denied" } },
])("rejects missing/inaccessible employees without creating tasks or alerts", async (result) => {
  mocks.profileQuery.maybeSingle.mockResolvedValue(result);
  await POST(new Request("https://klgcr.example/admin/daily-tasks/action", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ action: "admin_task_create", title: "Test", date: "2026-10-14", assignedTo: "missing", frequency: "once" }) }));
  expect(mocks.taskQuery.insert).not.toHaveBeenCalled();
  expect(mocks.createAppNotifications).not.toHaveBeenCalled();
});

it("does not notify when task creation fails", async () => {
  mocks.taskQuery.insert.mockResolvedValue({ error: { message: "insert failed" } });
  await POST(new Request("https://klgcr.example/admin/daily-tasks/action", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ action: "admin_task_create", title: "Test", date: "2026-10-14", assignedTo: "staff-id", frequency: "once" }) }));
  expect(mocks.createAppNotifications).not.toHaveBeenCalled();
});
