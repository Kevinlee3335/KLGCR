import { beforeEach, describe, expect, it, vi } from "vitest";
import { documentReviewers } from "@/lib/document-review-status";
import { advanceDocumentReview } from "./actions";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  requireRole: vi.fn(),
  verification: vi.fn(),
  rpc: vi.fn(),
  signature: vi.fn(),
  saveGymApproval: vi.fn(),
  scheduleBillingMail: vi.fn(),
  deliverGymReport: vi.fn(),
  push: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/document-review", async () => ({
  documentReviewers: (await import("@/lib/document-review-status")).documentReviewers,
  documentVerification: mocks.verification,
}));
vi.mock("@/lib/billing-mail", () => ({ scheduleBillingMail: mocks.scheduleBillingMail }));
vi.mock("@/lib/document-review-notifications", () => ({ dispatchDocumentReviewPushes: mocks.push }));
vi.mock("@/lib/gym-report-delivery", () => ({ deliverGymReport: mocks.deliverGymReport }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.signature }) }) }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ update: mocks.saveGymApproval }),
  }),
}));

const id = "b570ae91-218c-438b-a12d-9e1aa080e7a0";
const signature = { strokes: [[[0, 0], [1, 1]]] };
const entries = documentReviewers.slice(0, 2).map(reviewer => ({
  user_id: reviewer.id,
  name: reviewer.name,
  verified_at: "2026-11-01T01:00:00.000Z",
  signature,
}));

function form(type: "billing" | "gym") {
  const data = new FormData();
  data.set("type", type);
  data.set("id", id);
  return data;
}

describe("document approval and delivery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRole.mockResolvedValue({ id: documentReviewers[2].id });
    mocks.verification.mockResolvedValue(entries);
    mocks.signature.mockResolvedValue({ data: { signature }, error: null });
    mocks.saveGymApproval.mockReturnValue({
      eq: () => ({ is: async () => ({ error: null }) }),
    });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.push.mockResolvedValue(undefined);
    mocks.redirect.mockImplementation(() => { throw Error("redirect"); });
  });

  it("returns the saved Gym approval before starting email delivery", async () => {
    await expect(advanceDocumentReview(form("gym"))).rejects.toThrow("redirect");

    expect(mocks.saveGymApproval).toHaveBeenCalledWith(expect.objectContaining({
      approver: documentReviewers[2].id,
      approved_at: expect.any(String),
      signature,
      verifications: entries,
    }));
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/document-review/gym/" + id);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.deliverGymReport).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();

    await mocks.after.mock.calls[0][0]();
    expect(mocks.deliverGymReport).toHaveBeenCalledOnce();
    expect(mocks.deliverGymReport).toHaveBeenCalledWith(id);
  });

  it("does not schedule email before both verifications or a successful save", async () => {
    mocks.verification.mockResolvedValue(entries.slice(0, 1));
    await expect(advanceDocumentReview(form("gym"))).rejects.toThrow("another reviewer");

    mocks.verification.mockResolvedValue(entries);
    mocks.signature.mockResolvedValue({ data: null, error: null });
    await expect(advanceDocumentReview(form("gym"))).rejects.toThrow("Save your personal E-signature");

    mocks.rpc.mockResolvedValue({ error: { message: "Approval rejected" } });
    await expect(advanceDocumentReview(form("billing"))).rejects.toThrow("Approval rejected");
    expect(mocks.saveGymApproval).not.toHaveBeenCalled();
    expect(mocks.scheduleBillingMail).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("keeps the approved response when background scheduling is unavailable", async () => {
    mocks.after.mockImplementation(() => { throw Error("Scheduler unavailable"); });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(advanceDocumentReview(form("gym"))).rejects.toThrow("redirect");
      expect(mocks.saveGymApproval).toHaveBeenCalledOnce();
      expect(mocks.deliverGymReport).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("queues the Accounts email only after saving the billing approval", async () => {
    await expect(advanceDocumentReview(form("billing"))).rejects.toThrow("redirect");

    expect(mocks.rpc).toHaveBeenCalledWith("approve_billing_run", { billing_run_id: id });
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.scheduleBillingMail.mock.invocationCallOrder[0]);
    expect(mocks.scheduleBillingMail).toHaveBeenCalledWith(id);
    expect(mocks.push).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.push).toHaveBeenCalledWith(id);
  });

  it.each([0, 1])("returns after reviewer %i verifies and sends the phone alert in the background", async (stage) => {
    mocks.requireRole.mockResolvedValue({ id: documentReviewers[stage].id });
    mocks.verification.mockResolvedValue(entries.slice(0, stage));

    await expect(advanceDocumentReview(form("billing"))).rejects.toThrow("redirect");

    expect(mocks.rpc).toHaveBeenCalledWith("verify_document", { p_type: "billing", p_id: id });
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.after.mock.invocationCallOrder[0]);
    expect(mocks.push).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.push).toHaveBeenCalledWith(id);
  });

  it("does not schedule a phone alert if verification fails", async () => {
    mocks.requireRole.mockResolvedValue({ id: documentReviewers[0].id });
    mocks.verification.mockResolvedValue([]);
    mocks.rpc.mockResolvedValue({ error: { message: "Verification rejected" } });

    await expect(advanceDocumentReview(form("billing"))).rejects.toThrow("Verification rejected");
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
