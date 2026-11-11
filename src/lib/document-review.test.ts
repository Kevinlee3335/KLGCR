import { beforeEach, expect, it, vi } from "vitest";
import { after } from "next/server";
import { createAdminClient } from "./supabase/admin";
import { dispatchDocumentReviewPushes } from "./document-review-notifications";
import { ensureDueRentalInvoice } from "./rental-automation";
import { documentReviewers, pendingDocumentReviews } from "./document-review";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./billing-preview", () => ({ malaysiaClock: () => ({ date: "2026-11-02", time: "10:00" }) }));
vi.mock("./supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("./rental-automation", () => ({ ensureDueRentalInvoice: vi.fn() }));
vi.mock("./document-review-notifications", () => ({ dispatchDocumentReviewPushes: vi.fn() }));

const pack = { id: "pack-1", kind: "rental", period: "2026-11", total: 200 };

function mockQueries({ pending = [[pack]], approved = false, current = true, verified = false } = {}) {
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
          if (table === "document_verifications" && verified) data = [{ document_type: "billing", document_id: pack.id, entries: [{}] }];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
    },
  } as unknown as ReturnType<typeof createAdminClient>);
  return { billingReads: () => billingReads };
}

beforeEach(() => vi.resetAllMocks());

it("returns existing review cards for later reviewers before invoice generation and phone delivery", async () => {
  mockQueries({ verified: true });
  const docs = await pendingDocumentReviews(documentReviewers[1].id);
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

it.each(["created", "exists"])("shows a due pack in Fikri's first response if the pack was %s after the first read", async (status) => {
  const queries = mockQueries({ pending: [[], [pack]], current: false });
  vi.mocked(ensureDueRentalInvoice).mockResolvedValue({ status });
  vi.mocked(dispatchDocumentReviewPushes).mockResolvedValue(undefined);

  expect(await pendingDocumentReviews(documentReviewers[0].id)).toMatchObject([{ id: pack.id, type: "billing", amount: 200 }]);
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

it("leaves review queries and background work to assigned reviewer accounts", async () => {
  expect(await pendingDocumentReviews("ordinary-viewer")).toEqual([]);
  expect(createAdminClient).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
});
