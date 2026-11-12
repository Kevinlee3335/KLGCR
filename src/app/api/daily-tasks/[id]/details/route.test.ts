import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  from: vi.fn(),
  storage: vi.fn(),
  sign: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSessionProfile: mocks.session }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from, storage: { from: mocks.storage } }),
}));

const signedUrl = "https://example.test/signed/evidence";
const photo = { id: "photo-1", storage_path: "daily-tasks/32/private.jpg", created_at: "2026-11-12T03:00:00Z" };
const entry = { id: 1, action: "completed", comment: "Done", created_at: photo.created_at, actor: { full_name: "Siti" } };

function read(view = "photos", id = "32") {
  return GET(new NextRequest(`https://example.test/api/daily-tasks/${id}/details?view=${view}`), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ role: "admin" });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ order: mocks.order });
  mocks.order.mockReturnValue({ order: mocks.order, range: mocks.range, then: (resolve: (result: unknown) => void) => resolve({ data: [photo], error: null }) });
  mocks.range.mockResolvedValue({ data: [entry], error: null });
  mocks.storage.mockReturnValue({ createSignedUrls: mocks.sign });
  mocks.sign.mockResolvedValue({ data: [{ path: photo.storage_path, signedUrl, error: null }], error: null });
});

describe("daily task details", () => {
  it.each([null, "cleaner", "maintenance_staff", "gym_patrol"])("denies an ineligible role %s before reading data", async (role) => {
    mocks.session.mockResolvedValue(role ? { role } : null);
    const response = await read();
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([["0", "photos"], ["1.2", "photos"], ["9007199254740992", "photos"], ["32", "unknown"]])("rejects task %s and view %s when either is invalid", async (id, view) => {
    expect((await read(view, id)).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("signs photos for the requested task without returning storage path fields", async () => {
    mocks.session.mockResolvedValue({ role: "management_viewer" });
    const response = await read();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ view: "photos", photos: [{ id: photo.id, created_at: photo.created_at, url: signedUrl }] });
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("daily_task_photos");
    expect(mocks.eq).toHaveBeenCalledExactlyOnceWith("task_id", 32);
    expect(mocks.storage).toHaveBeenCalledExactlyOnceWith("checkout-evidence");
    expect(mocks.sign).toHaveBeenCalledExactlyOnceWith([photo.storage_path], 3600);
  });

  it("keeps all timeline entries in chronological order without accessing storage", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({ ...entry, id: index + 1 }));
    const last = { ...entry, id: 501 };
    mocks.range.mockResolvedValueOnce({ data: firstPage, error: null }).mockResolvedValueOnce({ data: [last], error: null });
    const response = await read("timeline");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ view: "timeline", activity: [...firstPage, last] });
    expect(mocks.from.mock.calls).toEqual([["daily_task_activity"], ["daily_task_activity"]]);
    expect(mocks.eq.mock.calls).toEqual([["task_id", 32], ["task_id", 32]]);
    expect(mocks.order.mock.calls).toEqual([["created_at"], ["id"], ["created_at"], ["id"]]);
    expect(mocks.range.mock.calls).toEqual([[0, 499], [500, 999]]);
    expect(mocks.storage).not.toHaveBeenCalled();
  });

  it("reports query failure without exposing database messages", async () => {
    mocks.range.mockResolvedValue({ data: null, error: { message: "private database error" } });
    const response = await read("timeline");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Unable to load daily task details. Please try again." });
  });
});
