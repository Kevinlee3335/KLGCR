import { beforeEach, expect, it, vi } from "vitest";
import { after } from "next/server";
import { createAdminClient } from "./supabase/admin";
import { dispatchDocumentReviewPushes } from "./document-review-notifications";
import { ensureDueRentalInvoice } from "./rental-automation";
import { documentReviewers, pendingDocumentReviews } from "./document-review";
import { documentVerificationSlots } from "./document-review-status";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./billing-preview", () => ({ malaysiaClock: () => ({ date: "2026-11-02", time: "10:00" }) }));
vi.mock("./supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("./rental-automation", () => ({ ensureDueRentalInvoice: vi.fn() }));
vi.mock("./document-review-notifications", () => ({ dispatchDocumentReviewPushes: vi.fn() }));

const pack = { id: "pack-1", kind: "rental", period: "2026-11", total: 200 };

function mockQueries({ pending = [[pack]], approved = false, current = true, verifiedBy = [] as string[] } = {}) {
  let billingReads = 0;
  vi.mocked(createAdminClient).mockReturnValue({
    from(table: string) {
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        order() { return this; },
        async maybeSingle() {
          return { data: current ? { id: pack.id, billing_run_approvals: approved ? { run_id: pack.id } : null } : null, error: null };
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          let data: unknown[] = [];
          if (table === "billing_preview_runs") data = pending[billingReads++] ?? [];
          if (table === "document_verifications" && verifiedBy.length) data = [{ document_type: "billing", document_id: pack.id, entries: verifiedBy.map(user_id => ({user_id})) }];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
    },
  } as unknown as ReturnType<typeof createAdminClient>);
  return { billingReads: () => billingReads };
}

beforeEach(() => vi.resetAllMocks());

it("returns existing review cards for later reviewers before invoice generation and phone delivery", async () => {
  mockQueries({ verifiedBy: documentReviewers.slice(0,2).map(reviewer => reviewer.id) });
  const docs = await pendingDocumentReviews(documentReviewers[2].id);
  expect(docs).toMatchObject([{ id: "pack-1", type: "billing", amount: 200 }]);
  expect(ensureDueRentalInvoice).not.toHaveBeenCalled();
  expect(dispatchDocumentReviewPushes).not.toHaveBeenCalled();

  const callback = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
  vi.mocked(ensureDueRentalInvoice).mockResolvedValue({ status: "created", id: "new-pack" });
  vi.mocked(dispatchDocumentReviewPushes).mockResolvedValue(undefined);
  await callback();
  expect(ensureDueRentalInvoice).toHaveBeenCalledOnce();
  expect(dispatchDocumentReviewPushes).toHaveBeenCalledOnce();
  expect(vi.mocked(ensureDueRentalInvoice).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(dispatchDocumentReviewPushes).mock.invocationCallOrder[0],
  );
  vi.mocked(ensureDueRentalInvoice).mockRejectedValueOnce(new Error("Temporary database error"));
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await callback();
    expect(dispatchDocumentReviewPushes).toHaveBeenCalledTimes(2);
  } finally {
    errorLog.mockRestore();
  }
});

it.each([[0, "created"], [1, "exists"]] as const)("shows a due pack for verifier %i when the pack %s after the first read", async (reviewer, status) => {
  const queries = mockQueries({ pending: [[], [pack]], current: false });
  vi.mocked(ensureDueRentalInvoice).mockResolvedValue({ status });
  vi.mocked(dispatchDocumentReviewPushes).mockResolvedValue(undefined);

  expect(await pendingDocumentReviews(documentReviewers[reviewer].id)).toMatchObject([{ id: pack.id, type: "billing", amount: 200 }]);
  expect(queries.billingReads()).toBe(2);
  expect(ensureDueRentalInvoice).toHaveBeenCalledExactlyOnceWith({ date: "2026-11-02", time: "10:00" });
  expect(dispatchDocumentReviewPushes).not.toHaveBeenCalled();

  const callback = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
  await callback();
  expect(ensureDueRentalInvoice).toHaveBeenCalledOnce();
  expect(dispatchDocumentReviewPushes).toHaveBeenCalledOnce();
});

it.each([false, true])("does not load the schedule for Fikri when this month's pack already exists, approved=%s", async (approved) => {
  const queries = mockQueries({ pending: [approved ? [] : [pack]], approved });
  const docs = await pendingDocumentReviews(documentReviewers[0].id);
  expect(docs).toHaveLength(approved ? 0 : 1);
  expect(queries.billingReads()).toBe(1);
  expect(ensureDueRentalInvoice).not.toHaveBeenCalled();
});

it.each([
  [[], [true, true, false]],
  [[documentReviewers[1].id], [true, false, false]],
  [[documentReviewers[0].id], [false, true, false]],
  [[documentReviewers[1].id, documentReviewers[0].id], [false, false, true]],
] as const)("shows a review only for the accounts that can act with signatures %j", async (signed, visibility) => {
  for (const [index, reviewer] of documentReviewers.entries()) {
    mockQueries({ verifiedBy: [...signed] });
    expect(await pendingDocumentReviews(reviewer.id)).toHaveLength(visibility[index] ? 1 : 0);
  }
});

it("leaves review queries and background work to assigned reviewer accounts", async () => {
  expect(await pendingDocumentReviews("ordinary-viewer")).toEqual([]);
  expect(createAdminClient).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
});

it("keeps signature display slots tied to the signer when Kevin signs first", () => {
  const [fikri, kevin] = documentReviewers;
  const kevinSignature = { user_id: kevin.id, verified_at: "2026-11-13T06:00:00Z" };
  const fikriSignature = { user_id: fikri.id, verified_at: "2026-11-13T07:00:00Z" };
  expect(documentVerificationSlots([kevinSignature])).toEqual([undefined, kevinSignature]);
  expect(documentVerificationSlots([kevinSignature, fikriSignature])).toEqual([fikriSignature, kevinSignature]);
});
