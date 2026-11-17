// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { dispatchFlexInspectionMail, retryQueuedFlexInspectionMail } from "./flex-inspection-mail";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  claim: vi.fn(),
  filter: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  gateway: vi.fn(),
  inspection: vi.fn(),
  render: vi.fn(),
  config: vi.fn(),
  queue: vi.fn(),
  cutoff: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/billing-mail", () => ({ gmailGateway: mocks.gateway }));
vi.mock("@/lib/flex-inspection-store", () => ({ loadFlexInspectionForReport: mocks.inspection }));
vi.mock("@/lib/flex-reports/generate", () => ({ generateFlexInspectionReportPack: mocks.render }));

const period = "2026-11";
const pinnedRecipient = "inspection-fixture@flex.com";
const cc = ["inspection-fixture-cc1@flex.com", "inspection-fixture-cc2@flex.com"];
const sender = "klgcr.noreply@gmail.com";
const sentAt = "2026-11-16T07:00:00Z";
const inspection = { period, completedAt: sentAt };
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(sentAt));
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("KLGCR_FLEX_MAIL_RECIPIENTS", JSON.stringify({ to: pinnedRecipient, cc }));
  const queue = {
    lte: (...args: unknown[]) => {
      mocks.cutoff(...args);
      return queue;
    },
    not: () => queue,
    or: () => queue,
    order: () => queue,
    limit: mocks.queue,
  };
  mocks.admin.mockImplementation(() => ({
    rpc: (...args: unknown[]) => ({ maybeSingle: () => mocks.claim(...args) }),
    from: (table: string) => ({
      select: (columns: string) => table === "flex_inspection_reviews" ? queue : ({
        eq: (key: string, value: boolean) => ({
          maybeSingle: () => mocks.config({ table, columns, key, value }),
        }),
      }),
      update: (value: Record<string, unknown>) => {
        mocks.update(value);
        const query = {
          eq(key: string, value: string) {
            mocks.filter(key, value);
            return query;
          },
          select: () => ({ maybeSingle: mocks.save }),
        };
        return query;
      },
    }),
  }));
  mocks.claim.mockResolvedValue({
    data: { period, recipient: pinnedRecipient, kevin_verified_at: sentAt, fikri_verified_at: sentAt },
    error: null,
  });
  mocks.inspection.mockResolvedValue({ inspection });
  mocks.render.mockResolvedValue(pdf);
  mocks.save.mockResolvedValue({ data: { period }, error: null });
  mocks.gateway.mockImplementation(async ({ action, key }: { action: string; key?: string }) =>
    action === "flex-inspection-capabilities"
      ? { ok: true, sender, capabilities: ["combinedPdf", "cc", "idempotency"] }
      : { ok: true, status: "sent", sender, to: pinnedRecipient, cc, sentAt, key },
  );
});

it("loads the exact approved To and CC from private production settings", async () => {
  vi.stubEnv("KLGCR_FLEX_MAIL_RECIPIENTS", undefined);
  mocks.config.mockResolvedValue({
    data: { recipients: { to: pinnedRecipient, cc } }, error: null,
  });

  await dispatchFlexInspectionMail(period);

  expect(mocks.config).toHaveBeenCalledWith({
    table: "flex_inspection_mail_config", columns: "recipients", key: "id", value: true,
  });
  expect(mocks.gateway).toHaveBeenCalledWith(expect.objectContaining({
    action: "flex-inspection-send", to: pinnedRecipient, cc,
  }), 25_000);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("does not read or claim outbound mail from preview", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  await dispatchFlexInspectionMail(period);
  await retryQueuedFlexInspectionMail();
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.gateway).not.toHaveBeenCalled();
});

it("does not claim a delivery with fewer than two CC contacts or with duplicate or non-Flex addresses", async () => {
  for (const recipients of [
    { to: pinnedRecipient, cc: cc.slice(0, 1) },
    { to: pinnedRecipient, cc: [pinnedRecipient.toUpperCase(), cc[1]] },
    { to: pinnedRecipient, cc: [cc[0], "someone@example.test"] },
  ]) {
    vi.stubEnv("KLGCR_FLEX_MAIL_RECIPIENTS", JSON.stringify(recipients));
    await dispatchFlexInspectionMail(period);
    await retryQueuedFlexInspectionMail();
  }
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.gateway).not.toHaveBeenCalled();
});

it("does not load or send the PDFs until both reviewers have verified", async () => {
  mocks.claim.mockResolvedValueOnce({ data: null, error: null });
  await dispatchFlexInspectionMail(period);
  expect(mocks.inspection).not.toHaveBeenCalled();
  expect(mocks.gateway).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("does not claim a verified inspection before its scheduled Malaysia date", async () => {
  await dispatchFlexInspectionMail("2027-02", new Date("2027-02-04T15:59:59Z"));
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.gateway).not.toHaveBeenCalled();
});

it("only loads due reports in the retry queue before and at the local send date", async () => {
  mocks.queue.mockResolvedValue({ data: [], error: null });
  await retryQueuedFlexInspectionMail(new Date("2027-02-04T15:59:59Z"));
  await retryQueuedFlexInspectionMail(new Date("2027-02-04T16:00:00Z"));
  expect(mocks.cutoff.mock.calls).toEqual([["period", "2027-01"], ["period", "2027-02"]]);
});

it("allows a verified report to be dispatched immediately on its scheduled Malaysia date", async () => {
  const holidayPeriod = "2027-02";
  mocks.claim.mockResolvedValueOnce({
    data: { period: holidayPeriod, recipient: pinnedRecipient, kevin_verified_at: sentAt, fikri_verified_at: sentAt },
    error: null,
  });
  await dispatchFlexInspectionMail(holidayPeriod, new Date("2027-02-04T16:00:00Z"));
  expect(mocks.gateway).toHaveBeenCalledWith(expect.objectContaining({
    action: "flex-inspection-send", key: "flex-inspection_2027-02",
  }), 25_000);
});

it("uses the approved To and both CC addresses and keeps one delivery key across retries", async () => {
  mocks.save.mockResolvedValueOnce({ data: null, error: Error("temporary db error") });
  await expect(dispatchFlexInspectionMail(period)).rejects.toThrow("Unable to save");
  await dispatchFlexInspectionMail(period);
  const claim = mocks.claim.mock.calls[1][1];
  expect(mocks.claim).toHaveBeenCalledWith("claim_flex_inspection_mail", {
    p_period: period, p_claim_token: expect.any(String), p_recipient: pinnedRecipient,
  });
  expect(claim.p_claim_token).not.toBe(mocks.claim.mock.calls[0][1].p_claim_token);
  const [first, second] = mocks.gateway.mock.calls.map(([request]) => request)
    .filter(request => request.action === "flex-inspection-send");
  expect(second).toEqual(first);
  expect(second).toMatchObject({
    action: "flex-inspection-send", from: sender, to: pinnedRecipient, cc,
    key: "flex-inspection_2026-11",
    fileName: "Flex-Fire-Safety-Inspection-2026-11.pdf",
    pdfBase64: Buffer.from(pdf).toString("base64"),
  });
  expect(mocks.update).toHaveBeenLastCalledWith({
    status: "sent", sent_at: sentAt, error: null, claim_token: null, locked_until: null,
  });
  expect(mocks.filter).toHaveBeenLastCalledWith("claim_token", claim.p_claim_token);
});

it("records an uncertain outcome when the gateway may have accepted the email", async () => {
  mocks.gateway.mockResolvedValueOnce({
    ok: true, sender, capabilities: ["combinedPdf", "cc", "idempotency"],
  }).mockRejectedValueOnce(Error("timeout"));
  await dispatchFlexInspectionMail(period);
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "uncertain", sent_at: null }));
});

it("stops before sending if the configured gateway does not support CC", async () => {
  mocks.gateway.mockResolvedValueOnce({
    ok: true, sender, capabilities: ["combinedPdf", "idempotency"],
  });
  await dispatchFlexInspectionMail(period);
  expect(mocks.gateway).toHaveBeenCalledTimes(1);
  expect(mocks.render).not.toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", sent_at: null }));
});

it("requires delivery confirmation for both CC addresses", async () => {
  mocks.gateway.mockResolvedValueOnce({
    ok: true, sender, capabilities: ["combinedPdf", "cc", "idempotency"],
  }).mockResolvedValueOnce({
    ok: true, status: "sent", key: "flex-inspection_2026-11", sender, to: pinnedRecipient, cc: [], sentAt,
  });
  await dispatchFlexInspectionMail(period);
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "uncertain", sent_at: null }));
});
