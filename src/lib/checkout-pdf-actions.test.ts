/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckoutPdfRoomInput } from "./checkout-pdf-import";

const state = vi.hoisted(() => ({
  role: "admin", tables: {} as Record<string, any[]>, rpc: vi.fn(), sign: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireRole: async (roles: string[]) => {
  if (!roles.includes(state.role)) throw new Error("Forbidden");
  return { id: "11111111-1111-4111-8111-111111111111" };
} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (value: string) => { throw new Error(value); } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  rpc: state.rpc,
  storage: { from: () => ({ createSignedUploadUrl: state.sign }) },
  from: (table: string) => {
    const filters: ((row: any) => boolean)[] = [];
    const result = () => ({ data: (state.tables[table] || []).filter(row => filters.every(filter => filter(row))), error: null });
    const query: any = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return query; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
      maybeSingle: async () => ({ ...result(), data: result().data[0] || null }),
      then: (resolve: any) => Promise.resolve(result()).then(resolve),
    };
    return query;
  },
}) }));
import { prepareCheckoutPdfRoom, finishCheckoutPdfRoom } from "@/app/(dashboard)/admin/checkouts/pdf-actions";

const input = (): CheckoutPdfRoomInput => ({ blockId: 1, blockCode: "A", roomNo: "A207", filename: "historical.pdf",
  fileHash: "b".repeat(64), defects: [{ sourceId: "DF-2026-0321", originalItem: "Kebersihan Dinding",
    originalFinding: "Terkopek", originalAction: "Cat masih terkopek", sourceStatus: "Belum Dibaiki",
    description: "Wall paint peeling", title: "Wall paint peeling A207", reportedDate: "2026-11-04", pageNumber: 14,
    photos: [{ label: "before", sourcePage: 14, type: "image/jpeg", size: 1024 },
      { label: "after", sourcePage: 14, type: "image/jpeg", size: 2048 }] }] });
const importId = "22222222-2222-4222-8222-222222222222";
const path = (index: number) => `pdf-import/11111111-1111-4111-8111-111111111111/${importId}/33333333-3333-4333-8333-33333333333${index}.jpg`;

beforeEach(() => {
  state.role = "admin";
  state.tables = { blocks: [{ id: 1, code: "A" }], checkout_rooms: [], checkout_defects: [] };
  state.rpc.mockReset().mockResolvedValue({ data: { created: true, roomId: "saved-room" }, error: null });
  state.sign.mockReset().mockResolvedValue({ data: { token: "signed" }, error: null });
});

describe("PDF import server boundaries", () => {
  it("prepares only staged photo uploads and creates no database task", async () => {
    const result = await prepareCheckoutPdfRoom(input());
    expect(result).toHaveProperty("uploads");
    if (!result.uploads) throw new Error("Expected uploads");
    expect(result.uploads).toHaveLength(2);
    expect(result.uploads.map(photo => photo.photoIndex)).toEqual([0, 1]);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("retains current room aliases and already imported source references", async () => {
    state.tables.checkout_rooms.push({ id: "active", block_id: 1, room_no: "A-207" });
    expect(await prepareCheckoutPdfRoom(input())).toMatchObject({ skipped: true, roomId: "active" });
    state.tables.checkout_rooms = [];
    state.tables.checkout_defects.push({ utmspace_source_key: "A:A207:DF-2026-0321", checkout_room_id: "historic" });
    expect(await prepareCheckoutPdfRoom(input())).toMatchObject({ skipped: true, roomId: "historic" });
    expect(state.sign).not.toHaveBeenCalled();
  });
  it("reports signing failure without creating a partial room", async () => {
    state.sign.mockResolvedValue({ data: null, error: { message: "Storage unavailable" } });
    expect(await prepareCheckoutPdfRoom(input())).toEqual({ error: "Storage unavailable" });
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed, missing, duplicated and foreign photo mappings before the RPC", async () => {
    for (const paths of [null, [null], [], [{ path: path(0), sourceId: "DF-2026-0321", photoIndex: 0 }],
      [{ path: path(0), sourceId: "DF-2026-0321", photoIndex: 0 }, { path: path(0), sourceId: "DF-2026-0321", photoIndex: 1 }],
      [{ path: "foreign/photo.jpg", sourceId: "DF-2026-0321", photoIndex: 0 }, { path: path(1), sourceId: "DF-2026-0321", photoIndex: 1 }],
    ]) {
      expect(await finishCheckoutPdfRoom(input(), importId, paths as any)).toHaveProperty("error");
    }
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("sends original status and both source photo labels to one atomic import", async () => {
    const paths = [0, 1].map(photoIndex => ({ path: path(photoIndex), sourceId: "DF-2026-0321", photoIndex }));
    expect(await finishCheckoutPdfRoom(input(), importId, paths)).toMatchObject({ created: true, roomId: "saved-room" });
    expect(state.rpc).toHaveBeenCalledOnce();
    expect(state.rpc.mock.calls[0][1].p_room.defects[0]).toMatchObject({ sourceStatus: "Belum Dibaiki", photos: [
      expect.objectContaining({ label: "before" }), expect.objectContaining({ label: "after" }),
    ] });
  });
  it("keeps failed finalization retryable and does not claim it succeeded", async () => {
    const value = input(); value.defects[0].photos = [];
    state.rpc.mockResolvedValue({ data: null, error: { message: "Batch reports are being generated" } });
    expect(await finishCheckoutPdfRoom(value, importId, [])).toEqual({ error: "Batch reports are being generated" });
    state.rpc.mockResolvedValue({ data: { created: false, roomId: "existing", reason: "Already imported" }, error: null });
    expect(await finishCheckoutPdfRoom(value, importId, [])).toMatchObject({ created: false, roomId: "existing" });
  });
  it("blocks read-only users before signing, querying or saving", async () => {
    state.role = "management_viewer";
    await expect(prepareCheckoutPdfRoom(input())).rejects.toThrow("Forbidden");
    await expect(finishCheckoutPdfRoom(input(), importId, [])).rejects.toThrow("Forbidden");
    expect(state.rpc).not.toHaveBeenCalled(); expect(state.sign).not.toHaveBeenCalled();
  });
});
