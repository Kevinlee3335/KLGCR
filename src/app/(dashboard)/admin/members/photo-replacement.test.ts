// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { File } from "node:buffer";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), upload: vi.fn(), remove: vi.fn(), update: vi.fn(), insert: vi.fn(), selected: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.authorize }));
vi.mock("@/lib/membership", () => ({ membershipEnabled: () => true, receiptOptionalForTesting: () => false }));
vi.mock("@/lib/membership-email", () => ({ deliverMembershipEmails: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
 storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
 from: (table: string) => table === "membership_activity" ? { insert: mocks.insert } : {
  select: () => ({ eq: () => ({ maybeSingle: mocks.selected }) }),
  update: (value: unknown) => { mocks.update(value); const q = { eq: () => q, is: () => q, select: () => ({ maybeSingle: async () => ({ data: { id: "member" }, error: null }) }) }; return q; },
 },
}) }));
import { replaceMemberPhoto } from "./actions";
const id = "55e422b3-06b4-4cfa-9ee9-396d02a55f0a";
function form(kind: string, type = "image/jpeg") {
 const f = new FormData(); f.set("member", id); f.set("kind", kind);
 f.set(kind === "card" ? "access_card" : "personal_photo", new File([new Uint8Array([255,216,255,0])], "photo.jpg", { type }));
 return f;
}
beforeEach(() => { vi.clearAllMocks(); mocks.authorize.mockResolvedValue({ id: "admin" }); mocks.selected.mockResolvedValue({ data: { photo_path: "old-personal", access_card_path: "old-card" }, error: null }); mocks.upload.mockResolvedValue({ error: null }); mocks.insert.mockResolvedValue({ error: null }); });
describe("admin membership photo replacement", () => {
 it.each([["card", "access_card_path"], ["personal", "photo_path"]])("updates the %s photo and records an audit entry", async (kind, field) => {
  await expect(replaceMemberPhoto(form(kind))).rejects.toThrow("success=photo");
  expect(mocks.authorize).toHaveBeenCalledWith(["admin"]);
  expect(mocks.upload).toHaveBeenCalledOnce();
  expect(mocks.update.mock.calls[0][0][field]).toMatch(new RegExp(`^${id}/.+\\.jpg$`));
  expect(mocks.insert).toHaveBeenCalledOnce();
 });
 it("rejects invalid file types without uploading", async () => {
  await expect(replaceMemberPhoto(form("card", "text/plain"))).rejects.toThrow("error=photo");
  expect(mocks.upload).not.toHaveBeenCalled();
 });
 it("blocks users without admin permission", async () => {
  mocks.authorize.mockRejectedValue(new Error("Unauthorized"));
  await expect(replaceMemberPhoto(form("card"))).rejects.toThrow("Unauthorized");
  expect(mocks.upload).not.toHaveBeenCalled();
 });
});
