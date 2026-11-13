import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

import { ComplianceExpiryFollowUp } from "./compliance-expiry-follow-up";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("shows three reminders until expanded and retains the expiry milestones and record links", async () => {
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
  expect(screen.queryByText("One month before")).toBeNull();
  expect(screen.getAllByRole("link", { name: "Follow up" })).toHaveLength(3);
  expect(screen.getByText("Upcoming").textContent).toBe("3 Upcoming");

  const toggle = screen.getByRole("button", { name: "Show 1 more" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  expect(screen.getByRole("button", { name: "Show less" })).toBe(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getAllByRole("link", { name: "Follow up" })).toHaveLength(4);
  expect(screen.getByText("One month before")).toBeTruthy();
  const contractRow = screen.getByRole("row", { name: /Maintenance agreement/ });
  expect(within(contractRow).getByRole("link", { name: "Follow up" }).getAttribute("href"))
    .toBe("/admin/cert-servicing/records/contract");
  expect(screen.getByText("Upcoming").textContent).toBe("3 Upcoming");

  fireEvent.click(toggle);
  expect(screen.getByRole("button", { name: "Show 1 more" }).getAttribute("aria-expanded")).toBe("false");
  expect(screen.getAllByRole("link", { name: "Follow up" })).toHaveLength(3);
});

it("omits the toggle when all reminders fit in the preview", async () => {
  rpc.mockResolvedValue({ error: null, data: [
    { cycle_id: "old", record_id: "fire", title: "Fire extinguisher", record_type: "certificate_license", location: "Block D", due_date: "2026-10-10", days_remaining: -2, stage: "daily" },
  ] });

  render(await ComplianceExpiryFollowUp());
  expect(screen.getByRole("link", { name: "Follow up" })).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});

it("hides the follow-up when there are no outstanding reminders for the date", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  expect(await ComplianceExpiryFollowUp()).toBeNull();
});
