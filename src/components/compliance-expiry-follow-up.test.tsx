import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

import { ComplianceExpiryFollowUp } from "./compliance-expiry-follow-up";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("shows both expiry milestones and the ongoing follow-up with their record links", async () => {
  rpc.mockResolvedValue({ error: null, data: [
    { cycle_id: "old", record_id: "fire", title: "Fire extinguisher", record_type: "certificate_license", location: "Block D", due_date: "2026-10-10", days_remaining: -2, stage: "daily" },
    { cycle_id: "today", record_id: "lift", title: "Lift servicing", record_type: "servicing", location: "Block A", due_date: "2026-10-15", days_remaining: 3, stage: "daily" },
    { cycle_id: "second", record_id: "genset", title: "Standby genset", record_type: "servicing", location: null, due_date: "2026-10-27", days_remaining: 15, stage: "fifteen_days" },
    { cycle_id: "first", record_id: "contract", title: "Maintenance agreement", record_type: "agreement", location: null, due_date: "2026-11-12", days_remaining: 31, stage: "month_before" },
  ] });

  render(await ComplianceExpiryFollowUp());
  expect(rpc).toHaveBeenCalledExactlyOnceWith("compliance_expiry_follow_ups");
  expect(screen.getByText("Overdue 2 days")).toBeTruthy();
  expect(screen.getByText("Due in 3 days")).toBeTruthy();
  expect(screen.getByText("15 days before")).toBeTruthy();
  expect(screen.getByText("One month before")).toBeTruthy();
  const contractRow = screen.getByRole("row", { name: /Maintenance agreement/ });
  expect(within(contractRow).getByRole("link", { name: "Follow up" }).getAttribute("href"))
    .toBe("/admin/cert-servicing/records/contract");
});

it("hides the follow-up when there are no outstanding reminders for the date", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  expect(await ComplianceExpiryFollowUp()).toBeNull();
});
