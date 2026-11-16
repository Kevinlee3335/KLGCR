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
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/billing-mail", () => ({ gmailGateway: mocks.gateway }));
vi.mock("@/lib/flex-inspection-store", () => ({ loadFlexInspectionForReport: mocks.inspection }));
vi.mock("@/lib/flex-reports/generate", () => ({ generateFlexInspectionReportPack: mocks.render }));

const period = "2026-11";
const pinnedRecipient = "reports@flex.example";
const sender = "klgcr.noreply@gmail.com";
const sentAt = "2026-11-16T07:00:00Z";
const inspection = { period, completedAt: sentAt };
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("KLGCR_FLEX_REPORT_TO", pinnedRecipient);
  mocks.admin.mockImplementation(() => ({
    rpc: mocks.claim,
    from: () => ({
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
  mocks.gateway.mockImplementation(async ({ key }: { key: string }) => ({
    ok: true, status: "sent", sender, to: pinnedRecipient, sentAt, key,
  }));
});

afterEach(() => vi.unstubAllEnvs());

it("does not read or claim outbound mail from preview or with an invalid recipient", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  await dispatchFlexInspectionMail(period);
  await retryQueuedFlexInspectionMail();
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("KLGCR_FLEX_REPORT_TO", "reports@flex.example,other@example.test");
  await dispatchFlexInspectionMail(period);
  await retryQueuedFlexInspectionMail();
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

it("uses the pinned recipient and one stable delivery key even if recording the send fails", async () => {
  vi.stubEnv("KLGCR_FLEX_REPORT_TO", "reports@flex.example");
  mocks.save.mockResolvedValueOnce({ data: null, error: Error("temporary db error") });
  await expect(dispatchFlexInspectionMail(period)).rejects.toThrow("Unable to save");
  await dispatchFlexInspectionMail(period);
  const claim = mocks.claim.mock.calls[1][1];
  expect(mocks.claim).toHaveBeenCalledWith("claim_flex_inspection_mail", {
    p_period: period, p_claim_token: expect.any(String), p_recipient: pinnedRecipient,
  });
  expect(claim.p_claim_token).not.toBe(mocks.claim.mock.calls[0][1].p_claim_token);
  const [first] = mocks.gateway.mock.calls[0];
  const [second] = mocks.gateway.mock.calls[1];
  expect(second).toEqual(first);
  expect(second).toMatchObject({
    action: "finance-send", from: sender, to: pinnedRecipient,
    key: expect.stringMatching(/^invoice_[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    fileName: "Flex-Fire-Safety-Inspection-2026-11.pdf",
    pdfBase64: Buffer.from(pdf).toString("base64"),
  });
  expect(mocks.update).toHaveBeenLastCalledWith({
    status: "sent", sent_at: sentAt, error: null, claim_token: null, locked_until: null,
  });
  expect(mocks.filter).toHaveBeenLastCalledWith("claim_token", claim.p_claim_token);
});

it("records an uncertain outcome when the gateway may have accepted the email", async () => {
  mocks.gateway.mockRejectedValueOnce(Error("timeout"));
  await dispatchFlexInspectionMail(period);
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "uncertain", sent_at: null }));
});
