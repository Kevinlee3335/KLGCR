// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { reviewMemberRequest, reviewPayment } from "./actions";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), row: vi.fn(), rpc: vi.fn(), exists: vi.fn(), testing: vi.fn(), bucket: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.authorize }));
vi.mock("@/lib/membership", () => ({ membershipEnabled: () => true, receiptOptionalForTesting: mocks.testing }));
vi.mock("@/lib/membership-email", () => ({ deliverMembershipEmails: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: mocks.bucket },
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.row }) }) }),
    rpc: mocks.rpc,
  }),
}));

const id = "55e422b3-06b4-4cfa-9ee9-396d02a55f0a";
function review(field: "payment" | "request", decision = "approve") {
  const form = new FormData();
  form.set(field, id);
  form.set("decision", decision);
  form.set("verified", "yes");
  form.set("note", "Reviewed");
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ id: "admin" });
  mocks.testing.mockReturnValue(false);
  mocks.row.mockResolvedValue({ data: { receipt_path: "receipt.pdf", request_type: "renew", member_id: id }, error: null });
  mocks.bucket.mockReturnValue({ exists: mocks.exists });
  mocks.exists.mockResolvedValue({ data: true, error: null });
  mocks.rpc.mockResolvedValue({ error: null });
});

it.each([
  ["payment", reviewPayment, "review_membership_payment_with_number"],
  ["request", reviewMemberRequest, "review_membership_request"],
] as const)("checks that the stored %s receipt still exists before approval", async (field, action, rpc) => {
  mocks.exists.mockResolvedValueOnce({ data: false, error: { message: "Not found" } });
  await expect(action(review(field))).rejects.toThrow("error=review");
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.bucket).toHaveBeenCalledWith("membership-receipts");
  expect(mocks.exists).toHaveBeenCalledWith("receipt.pdf");

  await expect(action(review(field))).rejects.toThrow("success=reviewed");
  expect(mocks.rpc).toHaveBeenCalledWith(rpc, expect.objectContaining({ p_approve: true }));
});

it("preserves testing submissions without receipts and cancellation reviews", async () => {
  mocks.row.mockResolvedValue({ data: { receipt_path: null, request_type: "cancel", member_id: id }, error: null });
  await expect(reviewMemberRequest(review("request"))).rejects.toThrow("success=reviewed");
  mocks.testing.mockReturnValue(true);
  await expect(reviewPayment(review("payment"))).rejects.toThrow("success=reviewed");
  expect(mocks.exists).not.toHaveBeenCalled();
});

it("allows rejection without checking the uploaded object", async () => {
  await expect(reviewPayment(review("payment", "reject"))).rejects.toThrow("success=reviewed");
  expect(mocks.exists).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith("review_membership_payment_with_number", expect.objectContaining({ p_approve: false }));
});
