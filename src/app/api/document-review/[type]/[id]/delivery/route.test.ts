import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  createAdminClient: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSessionProfile: mocks.getProfile }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

const id = "11111111-1111-4111-8111-111111111111";
const sentAt = "2026-11-11T04:00:00.000Z";
const results: Record<string, { data?: unknown; error?: unknown }> = {};
const request = (type: string, documentId = id) => GET(
  new Request(`https://example.test/api/document-review/${type}/${documentId}/delivery`),
  { params: Promise.resolve({ type, id: documentId }) },
);

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(results)) delete results[key];
  mocks.getProfile.mockResolvedValue({ role: "admin" });
  mocks.createAdminClient.mockReturnValue({ from: mocks.from });
  mocks.from.mockImplementation((table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => results[table] ?? { data: null } }) }),
  }));
});

it.each([null, { role: "management_viewer" }, { role: "cleaner" }])("requires an Admin account", async profile => {
  mocks.getProfile.mockResolvedValue(profile);
  expect((await request("billing")).status).toBe(403);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
});

it.each([["other", id], ["gym", "invalid"]])("rejects invalid document references before querying", async (type, documentId) => {
  expect((await request(type, documentId)).status).toBe(400);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
});

it("requires an actual billing approval and shows a legacy approved pack without a queue", async () => {
  results.billing_mail_dispatch = { data: { status: "sending" } };
  expect((await request("billing")).status).toBe(404);
  results.billing_run_approvals = { data: { run_id: id } };
  delete results.billing_mail_dispatch;
  expect(await (await request("billing")).json()).toEqual({ status: "not_queued", sentAt: null });
});

it.each(["pending", "sending", "sent", "blocked", "failed", "uncertain"])("reports persisted billing status %s without private dispatch fields", async status => {
  results.billing_run_approvals = { data: { run_id: id } };
  const timestamp = status === "sent" ? sentAt : null;
  results.billing_mail_dispatch = {
    data: { status, sent_at: timestamp, recipient: "internal@example.test", error: "Gateway details" },
  };
  const response = await request("billing");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ status, sentAt: timestamp });
});

it("does not expose an unapproved Gym report's reviewer notification as an Accounts email", async () => {
  results.gym_monthly_approvals = { data: { approved_at: null, sent_at: sentAt } };
  expect((await request("gym")).status).toBe(404);
});

it.each([null, sentAt])("reports Gym email status for sent timestamp %s", async timestamp => {
  results.gym_monthly_approvals = { data: { approved_at: sentAt, sent_at: timestamp } };
  expect(await (await request("gym")).json()).toEqual({ status: timestamp ? "sent" : "pending", sentAt: timestamp });
});

it("returns a generic unavailable status on a database error", async () => {
  results.billing_mail_dispatch = { error: { message: "Internal database failure" } };
  const response = await request("billing");
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Unable to check email delivery." });
});
