// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), send: vi.fn(), update: vi.fn(), eqEvent: vi.fn(), eqToken: vi.fn(),
}));

vi.mock("@/lib/push", () => ({ sendPushNotifications: mocks.send }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc, from: () => ({ update: mocks.update }) }),
}));

import { dispatchComplianceExpiryReminders } from "./compliance-expiry-reminders";

const alert = {
  id: "reminder-id",
  recipient_id: "admin-id",
  title: "Cert & Servicing expiry reminder",
  body: "Lift servicing. Due today.",
  href: "/admin/cert-servicing/records/record-id",
  expires_at: "2026-10-27T16:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockResolvedValueOnce({ error: null })
    .mockResolvedValueOnce({ data: [alert], error: null }).mockResolvedValueOnce({ data: [], error: null });
  mocks.update.mockReturnValue({ eq: mocks.eqEvent });
  mocks.eqEvent.mockReturnValue({ eq: mocks.eqToken });
  mocks.eqToken.mockResolvedValue({ error: null });
});

it("sends the same linked reminder to the Admin's device and records delivery using its lease", async () => {
  mocks.send.mockResolvedValue(undefined);
  await dispatchComplianceExpiryReminders();
  expect(mocks.rpc).toHaveBeenNthCalledWith(1, "queue_compliance_expiry_reminders");
  const lease = mocks.rpc.mock.calls[1][1].p_token;
  expect(mocks.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    recipientIds: [alert.recipient_id], href: alert.href, tag: `compliance-expiry-${alert.id}`, expiresAt: alert.expires_at,
  }));
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ delivered_at: expect.any(String), locked_until: null }));
  expect(mocks.eqEvent).toHaveBeenCalledWith("id", alert.id);
  expect(mocks.eqToken).toHaveBeenCalledWith("claim_token", lease);
});

it("keeps a failed delivery pending and continues the batch loop", async () => {
  mocks.send.mockRejectedValue(new Error("No reachable push device"));
  await dispatchComplianceExpiryReminders();
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(mocks.update).toHaveBeenCalledWith({ last_error: "Phone alert pending. Check the device subscription." });
  expect(mocks.rpc).toHaveBeenCalledTimes(3);
});
