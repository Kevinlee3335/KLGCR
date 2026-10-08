import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ role: vi.fn(), rpc: vi.fn(), insert: vi.fn(), list: vi.fn(), remove: vi.fn(), task: vi.fn(), signed: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.role }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc: mocks.rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.task }) }) }) })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ storage: { from: () => ({ list: mocks.list, createSignedUploadUrl: mocks.signed }) }, from: () => ({ insert: mocks.insert, delete: () => ({ in: mocks.remove }) }) }) }));
import { completeAdminDailyTask, prepareAdminDailyTaskEvidence } from "./evidence-actions";
const path = "daily-tasks/42/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ id: "admin-id" });
  mocks.task.mockResolvedValue({ data: { id: 42 } });
  mocks.list.mockResolvedValue({ data: [{ name: path.split("/").pop(), metadata: { size: 100 } }] });
  mocks.insert.mockReturnValue({ select: async () => ({ data: [{ id: "photo-id" }], error: null }) });
  mocks.rpc.mockResolvedValue({ error: null });
});
describe("Admin completion evidence", () => {
  it("requires admin authorization before issuing upload credentials", async () => {
    mocks.role.mockRejectedValue(new Error("denied"));
    await expect(prepareAdminDailyTaskEvidence(42, 1)).rejects.toThrow("denied");
    expect(mocks.signed).not.toHaveBeenCalled();
  });
  it("rejects another task's photo path", async () => {
    expect(await completeAdminDailyTask(42, "", [path.replace("/42/", "/43/")])).toHaveProperty("error");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not complete a task when the photo has not uploaded", async () => {
    mocks.list.mockResolvedValue({ data: [] });
    expect(await completeAdminDailyTask(42, "", [path])).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not complete a task when its evidence record fails", async () => {
    mocks.insert.mockReturnValue({ select: async () => ({ error: { message: "save failed" } }) });
    expect(await completeAdminDailyTask(42, "", [path])).toEqual({ error: "save failed" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("removes newly saved photo records when status update fails", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "status failed" } });
    expect(await completeAdminDailyTask(42, "Done", [path])).toEqual({ error: "status failed" });
    expect(mocks.remove).toHaveBeenCalledWith("id", ["photo-id"]);
  });
  it("saves the photos and uses the existing completion timeline function", async () => {
    expect(await completeAdminDailyTask(42, " Done ", [path])).toEqual({ ok: true });
    expect(mocks.insert).toHaveBeenCalledWith([{ task_id: 42, storage_path: path, uploaded_by: "admin-id" }]);
    expect(mocks.rpc).toHaveBeenCalledWith("admin_update_daily_task", { p_id: 42, p_status: "completed", p_comment: "Done" });
  });
});
