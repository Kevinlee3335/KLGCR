import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { documentReviewers } from "@/lib/document-review-status";
import Page from "./page";

const mocks = vi.hoisted(() => ({ from: vi.fn(), reviewEntries: vi.fn(), requireRole: vi.fn(), verification: vi.fn() }));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/billing-document-queries", () => ({ loadBillingReviewEntries: mocks.reviewEntries }));
vi.mock("@/lib/document-review", async () => ({
  documentReviewers: (await import("@/lib/document-review-status")).documentReviewers,
  documentVerification: mocks.verification,
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("./actions", () => ({ advanceDocumentReview: vi.fn() }));

it("lets James approve using the saved invoice summary with full preview on demand", async () => {
  const id = "b570ae91-218c-438b-a12d-9e1aa080e7a0";
  mocks.requireRole.mockResolvedValue({ id: documentReviewers[2].id });
  mocks.verification.mockResolvedValue(documentReviewers.slice(0, 2).map(reviewer => ({
    user_id: reviewer.id,
    name: reviewer.name,
    verified_at: "2026-11-10T01:00:00Z",
    signature: { strokes: [[[0, 0], [1, 1]]] },
  })));
  mocks.reviewEntries.mockResolvedValue([{ line_index: 0, bill_no: "UTIL-02", account_name: "First company", amount: 13 }]);
  const runFilter = vi.fn().mockReturnValue({ single: async () => ({ data: { kind: "utility", period: "2026-11", total: 13 }, error: null }) });
  const runSelect = vi.fn().mockReturnValue({ eq: runFilter });
  const approvalSelect = vi.fn().mockReturnValue({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) });
  mocks.from.mockImplementation((table: string) => ({ select: table === "billing_preview_runs" ? runSelect : approvalSelect }));

  render(await Page({ params: Promise.resolve({ type: "billing", id }) }));

  expect(runSelect).toHaveBeenCalledWith("kind,period,total");
  expect(runFilter).toHaveBeenCalledWith("id", id);
  expect(mocks.reviewEntries).toHaveBeenCalledWith(id);
  expect(screen.getByText("UTIL-02")).toBeInTheDocument();
  expect(screen.getByText("First company")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve & send to Accounts" })).toBeEnabled();
  expect(screen.getByRole("link", { name: "Preview Invoice" })).toHaveAttribute("href", `/api/document-review/billing/${id}/preview`);
});
