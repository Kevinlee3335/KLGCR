import { afterEach, describe, expect, it, vi } from "vitest";
import { complaintReceivedEmail, sendTransactionalEmail, tenantNotAvailableEmail } from "./email";

describe("transactional email", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.KLGCR_EMAIL_ENABLED; delete process.env.RESEND_API_KEY; delete process.env.KLGCR_EMAIL_FROM; });

  it("does not call Resend when email is disabled", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); process.env.KLGCR_EMAIL_ENABLED = "false";
    expect((await sendTransactionalEmail("resident@example.com", { subject: "Test", text: "Body" })).sent).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not call Resend without a reporter email", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); process.env.KLGCR_EMAIL_ENABLED = "true";
    await sendTransactionalEmail("  ", { subject: "Test", text: "Body" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("absorbs Resend failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    process.env.KLGCR_EMAIL_ENABLED = "true"; process.env.RESEND_API_KEY = "secret"; process.env.KLGCR_EMAIL_FROM = "KLG <test@example.com>";
    expect((await sendTransactionalEmail("resident@example.com", { subject: "Test", text: "Body" })).sent).toBe(false);
  });

  it("builds receipt and tenant unavailable messages", () => {
    const complaint = { reporterName: "Aisha", complaintNo: "CMP-1", roomNo: "A-1", description: "Leaking tap" };
    expect(complaintReceivedEmail({ ...complaint, submittedAt: "2026-09-12T10:00:00Z" }).text).toContain("Dear Aisha");
    const noShow = tenantNotAvailableEmail({ ...complaint, appointmentDate: "2026-09-13", appointmentTime: "10:00", attendedAt: "2026-09-13T10:05:00Z" });
    expect(noShow.subject).toBe("Maintenance Visit – Tenant Not Available");
    expect(noShow.text).toContain("Maintenance Attendance Time: 2026-09-13T10:05:00Z");
  });
});
