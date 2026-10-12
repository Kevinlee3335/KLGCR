import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ role: vi.fn(), task: vi.fn(), rpc: vi.fn(), notify: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.role }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/daily-task-notifications", () => ({ notifyDailyTaskCompleted: mocks.notify }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, from: () => ({ select: () => ({ eq: mocks.eq }) }) }) }));
import { completeDailyTask } from "./actions";
beforeEach(() => {
  vi.clearAllMocks();
  const query = { eq: mocks.eq, maybeSingle: mocks.task };
  mocks.eq.mockReturnValue(query);
  mocks.role.mockResolvedValue({ id: "staff-id", full_name: "Faiz" });
  mocks.task.mockResolvedValue({ data: { id: 42, title: "Check lobby", status: "in_progress", task_date: "2026-10-12", task_category: "operation" }, error: null });
  mocks.rpc.mockResolvedValue({ error: null });
});
describe("staff daily task completion notification", () => {
  it("notifies only after authorized completion succeeds", async () => {
    expect(await completeDailyTask(42, "Done", [])).toEqual({ ok: true });
    expect(mocks.eq).toHaveBeenCalledWith("assigned_to", "staff-id");
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ id: 42, status: "in_progress" }), "Faiz");
  });
  it("does not send a completion alert when the completion RPC fails", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "photo required" } });
    expect(await completeDailyTask(42, "Done", [])).toEqual({ error: "photo required" });
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("does not complete another employee's task", async () => {
    mocks.task.mockResolvedValue({ data: null, error: null });
    expect(await completeDailyTask(42, "Done", [])).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
