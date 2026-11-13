// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { documentReviewers } from "@/lib/document-review-status";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  advanceReview: vi.fn(),
  getInvoice: vi.fn(),
  dispatchMail: vi.fn(),
  dispatchPush: vi.fn(),
  after: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Error(path); } }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/document-review-notifications", () => ({ dispatchDocumentReviewPushes: mocks.dispatchPush }));
vi.mock("@/lib/unifi-invoice-mail", () => ({ dispatchUnifiInvoiceMail: mocks.dispatchMail }));
vi.mock("@/lib/unifi-invoices", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/unifi-invoices")>(),
  advanceUnifiInvoiceReview: mocks.advanceReview,
  getUnifiInvoice: mocks.getInvoice,
}));

import { retryUnifiInvoiceEmail, reviewUnifiInvoice } from "./actions";

const invoiceId = "11111111-1111-4111-8111-111111111111";
const listPath = "/admin/unifi-invoices";
const invoicePath = `${listPath}/${invoiceId}`;
const [fikri, , james] = documentReviewers;

function form(stage?: string) {
  const data = new FormData();
  data.set("id", invoiceId);
  if (stage) data.set("stage", stage);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRole.mockResolvedValue(james);
  mocks.dispatchMail.mockResolvedValue({ status: "sent" });
  mocks.dispatchPush.mockResolvedValue(undefined);
});

it("queues the Joey email only after James's approval is saved", async () => {
  await expect(reviewUnifiInvoice(form("james"))).rejects.toThrow(invoicePath + "?saved=1");
  expect(mocks.advanceReview).toHaveBeenCalledExactlyOnceWith(invoiceId, "james", james.id);
  expect(mocks.dispatchMail).not.toHaveBeenCalled();
  await mocks.after.mock.calls[0][0]();
  expect(mocks.dispatchMail).toHaveBeenCalledExactlyOnceWith(invoiceId);
  expect(mocks.dispatchPush).not.toHaveBeenCalled();
});

it("keeps Fikri verification on the existing push path", async () => {
  mocks.requireRole.mockResolvedValue(fikri);
  await expect(reviewUnifiInvoice(form("fikri"))).rejects.toThrow(invoicePath + "?saved=1");
  await mocks.after.mock.calls[0][0]();
  expect(mocks.dispatchPush).toHaveBeenCalledExactlyOnceWith(invoiceId);
  expect(mocks.dispatchMail).not.toHaveBeenCalled();
});

it("keeps archived invoices out of manual email retries", async () => {
  mocks.getInvoice.mockResolvedValue({ review_stage: "archived" });
  await expect(retryUnifiInvoiceEmail(form())).rejects.toThrow(invoicePath + "?error=email");
  expect(mocks.dispatchMail).not.toHaveBeenCalled();
});

it("requires the approver or Super Admin to check an approved delivery", async () => {
  mocks.requireRole.mockResolvedValue(fikri);
  await expect(retryUnifiInvoiceEmail(form())).rejects.toThrow(listPath);
  expect(mocks.getInvoice).not.toHaveBeenCalled();

  mocks.requireRole.mockResolvedValue(james);
  mocks.getInvoice.mockResolvedValue({ review_stage: "approved" });
  await expect(retryUnifiInvoiceEmail(form())).rejects.toThrow(invoicePath);
  expect(mocks.dispatchMail).toHaveBeenCalledExactlyOnceWith(invoiceId);
});
