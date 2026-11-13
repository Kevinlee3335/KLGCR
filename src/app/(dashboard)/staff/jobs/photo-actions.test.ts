import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  rpc: vi.fn(),
  sign: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    storage: { from: () => ({ createSignedUploadUrl: mocks.sign }) },
  }),
}));

import { prepareCompletionUploads } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "staff-1" });
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  mocks.sign.mockResolvedValue({ data: { token: "signed-token" } });
});

it("checks assignment and material approval once before signing uploads in selection order", async () => {
  const descriptors = ["image/webp", "image/png", "image/jpeg"].map(type => ({ type, size: 100 }));
  const result = await prepareCompletionUploads("job-1", descriptors);
  expect(mocks.role).toHaveBeenCalledExactlyOnceWith(["maintenance_staff"]);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("has_pending_job_material_approval", { p_job_id: "job-1" });
  expect(mocks.sign).toHaveBeenCalledTimes(3);
  expect(result.uploads?.map(({ path }) => path.slice(path.lastIndexOf(".")))).toEqual([".webp", ".png", ".jpg"]);
  expect(result.uploads?.every(({ path }) => path.startsWith("job-1/completion/"))).toBe(true);
});

it("rejects invalid photos and prevents signing for an unassigned job", async () => {
  expect(await prepareCompletionUploads("job-1", [{ type: "image/jpeg", size: NaN }])).toHaveProperty("error");
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ error: { message: "Job not found or cannot be completed" } });
  expect(await prepareCompletionUploads("job-1", [{ type: "image/jpeg", size: 100 }])).toHaveProperty("error");
  expect(mocks.sign).not.toHaveBeenCalled();
});

it("does not sign uploads for a job with a pending material approval", async () => {
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  expect(await prepareCompletionUploads("job-1", [{ type: "image/jpeg", size: 100 }])).toEqual({ pendingApproval: true });
  expect(mocks.sign).not.toHaveBeenCalled();
});
