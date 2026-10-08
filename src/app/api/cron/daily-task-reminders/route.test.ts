import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createAppNotifications = vi.fn();
  const taskList = { select: vi.fn(), eq: vi.fn(), not: vi.fn(), is: vi.fn() };
  const claim = { update: vi.fn(), eq: vi.fn(), is: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() };
  Object.values(taskList).forEach((method) => vi.mocked(method).mockReturnValue(taskList as never));
  taskList.not.mockImplementationOnce(() => taskList as never).mockImplementationOnce(() => Promise.resolve({ data: [{ id: 42, title: "Check pump room", assigned_to: "staff-id" }], error: null }) as never);
  Object.values(claim).forEach((method) => vi.mocked(method).mockReturnValue(claim as never));
  claim.maybeSingle.mockResolvedValue({ data: { id: 42 }, error: null });
  const db = {
    rpc: vi.fn().mockResolvedValue({ error: null }),
    from: vi.fn().mockImplementationOnce(() => taskList).mockImplementation(() => claim),
  };
  return { createAppNotifications, db };
});

vi.mock("@/lib/app-notifications", () => ({ createAppNotifications: mocks.createAppNotifications }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => mocks.db) }));

import { GET } from "./route";

describe("daily task reminders", () => {
  it("creates the due task and sends one phone reminder without a numeric UUID field", async () => {
    const previousSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-secret";
    const response = await GET(new Request("https://klgcr.example/api/cron/daily-task-reminders", { headers: { authorization: "Bearer test-secret" } }) as never);
    process.env.CRON_SECRET = previousSecret;

    expect(response.status).toBe(200);
    expect(mocks.db.rpc).toHaveBeenCalledWith("materialize_recurring_tasks", expect.objectContaining({ p_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }));
    expect(mocks.createAppNotifications).toHaveBeenCalledWith(expect.objectContaining({
      recipientIds: ["staff-id"],
      title: "Daily task due today",
      entityId: null,
    }));
  });
});
