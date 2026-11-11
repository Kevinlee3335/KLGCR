import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { authorize, requestDatabase } = vi.hoisted(() => ({ authorize: vi.fn(), requestDatabase: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole: authorize }));
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { createAdminClient: () => createClient("https://database.example.test", "fake-key", {
    auth: { persistSession: false }, global: { fetch: requestDatabase },
  }) };
});
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("./actions", () => ({
  reviewPayment: vi.fn(), retryMembershipEmails: vi.fn(), reviewMemberRequest: vi.fn(),
  updateMemberStatus: vi.fn(), replaceMemberPhoto: vi.fn(),
}));

import MembersPage from "./page";

const memberId = "55e422b3-06b4-4cfa-9ee9-396d02a55f0a";
const paymentId = "2778ee9a-22f5-4617-b807-c9e7016df6b7";
const requestId = "ec32502b-dca7-4811-b008-e2bbf9569241";
const createdAt = "2026-11-01T00:00:00.000Z";
const member = {
  id: memberId, full_name: "Gym Member", email: "member@example.test", room_no: "A101",
  member_type: "resident", status: "active", created_at: createdAt, expires_on: "2026-11-30",
  photo_path: "protected-portrait.jpg", access_card_path: "protected-card.jpg",
};
const payment = {
  id: paymentId, member_id: memberId, period_start: "2026-11-01", amount: 40,
  kind: "registration", status: "pending_verification", created_at: createdAt,
  receipt_path: "protected-payment.pdf", memberships: member,
};
const request = {
  id: requestId, member_id: memberId, full_name: member.full_name, room_no: member.room_no,
  request_type: "renew", receipt_path: "protected-renewal.pdf", status: "pending", created_at: createdAt,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("KLGCR_MEMBERSHIP_ENABLED", "true");
  vi.stubEnv("KLGCR_MEMBERSHIP_EMAIL_ENABLED", "false");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
  vi.stubEnv("VERCEL_ENV", "production");
  authorize.mockResolvedValue({ id: "admin", role: "admin" });
  requestDatabase.mockImplementation(async (input: string) => {
    const { pathname, searchParams } = new URL(input);
    if (pathname.startsWith("/storage/v1/object/sign/membership-photos/")) {
      return Response.json({ signedURL: "/object/sign/membership-photos/photo.jpg?token=fake" });
    }
    const table = pathname.split("/").at(-1);
    const rows = table === "memberships" ? [member]
      : table === "membership_payments" ? [payment]
      : table === "membership_requests" ? [request]
      : table === "membership_activity" ? [{ id: "activity", event: "payment_approved", actor_id: "actor", actor: { full_name: "Reviewer" }, created_at: createdAt, details: {} }]
      : [];
    // Detail's maybeSingle GET expects a JSON array. Exact counts are read from the range header.
    if (table === "memberships" && searchParams.get("id") === "eq.missing") return Response.json([]);
    return Response.json(rows, { headers: { "Content-Range": `0-${Math.max(0, rows.length-1)}/${rows.length}` } });
  });
});

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it("loads the overview metadata and creates protected links without signing any files", async () => {
  const { container } = render(await MembersPage({ searchParams: Promise.resolve({}) }));
  expect(authorize).toHaveBeenCalledWith(["admin"]);
  expect(screen.getByRole("heading", { name: "Payment verification (1)" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Member list (1)" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View personal photo" }))
    .toHaveAttribute("href", `/api/membership/admin-media/member-photo/${memberId}`);
  expect(screen.getAllByRole("link", { name: "View receipt" }).map(link => link.getAttribute("href"))).toEqual([
    `/api/membership/admin-media/request-receipt/${requestId}`,
    `/api/membership/admin-media/payment-receipt/${paymentId}`,
  ]);
  expect(screen.getByRole("button", { name: "Approve payment" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Approve request" })).toBeEnabled();
  expect(requestDatabase.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    "/rest/v1/memberships", "/rest/v1/membership_payments", "/rest/v1/membership_emails", "/rest/v1/membership_requests",
  ]);
  expect(container.innerHTML).not.toContain("protected-");
});

it("opens only the selected member detail and signs their portrait and card, with receipts still on demand", async () => {
  render(await MembersPage({ searchParams: Promise.resolve({ id: memberId }) }));
  expect(screen.getByRole("heading", { name: "Gym Member" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /Personal photo of/ })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /Uploaded Access Card/ })).toBeInTheDocument();
  expect(screen.getByText(/Management · Reviewer/)).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /Payment verification/ })).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: /View receipt/ }).map(link => link.getAttribute("href"))).toEqual([
    `/api/membership/admin-media/payment-receipt/${paymentId}`,
    `/api/membership/admin-media/request-receipt/${requestId}`,
  ]);
  const requests = requestDatabase.mock.calls.map(([url]) => new URL(url));
  expect(requests.filter(url => url.pathname.startsWith("/storage/")).map(url => url.pathname)).toEqual([
    "/storage/v1/object/sign/membership-photos/protected-portrait.jpg",
    "/storage/v1/object/sign/membership-photos/protected-card.jpg",
  ]);
  expect(requests.filter(url => url.pathname.startsWith("/rest/v1/"))).toHaveLength(4);
  expect(requests.some(url => url.pathname.endsWith("/membership_emails"))).toBe(false);
});
