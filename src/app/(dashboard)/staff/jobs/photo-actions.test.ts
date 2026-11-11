import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  job: vi.fn(),
  eq: vi.fn(),
  sign: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ eq: mocks.eq }) }),
    storage: { from: () => ({ createSignedUploadUrl: mocks.sign }) },
  }),
}));

import { prepareCompletionUploads } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "staff-1" });
  mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.job });
  mocks.job.mockResolvedValue({ data: { id: "job-1" } });
  mocks.sign.mockResolvedValue({ data: { token: "signed-token" } });
});

it("checks assignment once and prepares signed upload URLs in selection order", async () => {
  const descriptors = ["image/webp", "image/png", "image/jpeg"].map(type => ({ type, size: 100 }));
  const result = await prepareCompletionUploads("job-1", descriptors);
  expect(mocks.role).toHaveBeenCalledExactlyOnceWith(["maintenance_staff"]);
  expect(mocks.eq.mock.calls).toEqual([["id", "job-1"], ["assigned_to", "staff-1"]]);
  expect(mocks.job).toHaveBeenCalledTimes(1);
  expect(mocks.sign).toHaveBeenCalledTimes(3);
  expect(result.uploads?.map(({ path }) => path.slice(path.lastIndexOf(".")))).toEqual([".webp", ".png", ".jpg"]);
  expect(result.uploads?.every(({ path }) => path.startsWith("job-1/completion/"))).toBe(true);
});

it("rejects invalid photos and prevents signing for an unassigned job", async () => {
  expect(await prepareCompletionUploads("job-1", [{ type: "image/jpeg", size: NaN }])).toHaveProperty("error");
  expect(mocks.job).not.toHaveBeenCalled();
  mocks.job.mockResolvedValue({ data: null });
  expect(await prepareCompletionUploads("job-1", [{ type: "image/jpeg", size: 100 }])).toHaveProperty("error");
  expect(mocks.sign).not.toHaveBeenCalled();
});
