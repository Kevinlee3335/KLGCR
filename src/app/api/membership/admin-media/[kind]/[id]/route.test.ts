// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  profile: vi.fn(), enabled: vi.fn(), database: vi.fn(), table: vi.fn(), select: vi.fn(),
  eq: vi.fn(), row: vi.fn(), bucket: vi.fn(), sign: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSessionProfile: mocks.profile }));
vi.mock("@/lib/membership", () => ({ membershipEnabled: mocks.enabled }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.database }));

const recordId = "55e422b3-06b4-4cfa-9ee9-396d02a55f0a";
const signed = "https://storage.example.test/signed";
function get(kind: string, id = recordId) {
  return GET(new Request("https://app.example.test/admin-media"), { params: Promise.resolve({ kind, id }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.profile.mockResolvedValue({ role: "admin" });
  mocks.enabled.mockReturnValue(true);
  mocks.database.mockReturnValue({ from: mocks.table, storage: { from: mocks.bucket } });
  mocks.table.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.row });
  mocks.bucket.mockReturnValue({ createSignedUrl: mocks.sign });
  mocks.sign.mockResolvedValue({ data: { signedUrl: signed }, error: null });
});

it.each([
  ["payment-receipt", "membership_payments", "receipt_path", "membership-receipts"],
  ["request-receipt", "membership_requests", "receipt_path", "membership-receipts"],
  ["member-photo", "memberships", "photo_path", "membership-photos"],
])("signs only the stored %s after the authenticated request", async (kind, table, column, bucket) => {
  mocks.row.mockResolvedValue({ data: { [column]: "stored/private-file" }, error: null });
  const response = await get(kind);
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(signed);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(mocks.table).toHaveBeenCalledWith(table);
  expect(mocks.select).toHaveBeenCalledWith(column);
  expect(mocks.eq).toHaveBeenCalledWith("id", recordId);
  expect(mocks.bucket).toHaveBeenCalledWith(bucket);
  expect(mocks.sign).toHaveBeenCalledWith("stored/private-file", 300);
});

it.each([null, { role: "management_viewer" }, { role: "gym_patrol" }])("rejects a non-admin before using storage", async profile => {
  mocks.profile.mockResolvedValue(profile);
  expect((await get("payment-receipt")).status).toBe(403);
  expect(mocks.database).not.toHaveBeenCalled();
});

it("rejects disabled membership, unknown media kinds and raw storage paths", async () => {
  expect((await get("constructor")).status).toBe(400);
  expect((await get("payment-receipt", "folder/private-file")).status).toBe(400);
  mocks.enabled.mockReturnValue(false);
  expect((await get("payment-receipt")).status).toBe(404);
  expect(mocks.database).not.toHaveBeenCalled();
});

it("reports a missing or inaccessible file without disclosing the storage path", async () => {
  mocks.row.mockResolvedValueOnce({ data: { receipt_path: null }, error: null });
  expect((await get("payment-receipt")).status).toBe(404);
  expect(mocks.sign).not.toHaveBeenCalled();
  mocks.row.mockResolvedValueOnce({ data: { receipt_path: "stored/private-file" }, error: null });
  mocks.sign.mockResolvedValueOnce({ data: null, error: { message: "stored/private-file" } });
  const response = await get("payment-receipt");
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("stored/private-file");
});
