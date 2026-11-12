import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import Page from "./page";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), from: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));

const other = { inventory_item_id: null, item: null, approved_qty: null, issued_qty: 0, requested_qty: 2 };
const requests = [
  { id: "request-1", request_no: "MR-001", status: "pending", items: [
    { ...other, id: "other-1", other_item_name: "Window Handle" },
    { ...other, id: "known-1", other_item_name: "Linked material", inventory_item_id: "inventory-1" },
  ] },
  { id: "request-2", request_no: "MR-002", status: "approved", items: [
    { ...other, id: "other-2", other_item_name: "Previously approved bracket", approved_qty: 2 },
  ] },
  { id: "request-3", request_no: "MR-003", status: "rejected", items: [
    { ...other, id: "other-3", other_item_name: "Rejected material" },
  ] },
].map((request) => ({ ...request, created_at: "2026-11-12T02:00:00Z" }));

beforeEach(() => {
  mocks.from.mockClear().mockReturnValue({ select: mocks.select });
  mocks.select.mockClear().mockReturnValue({ order: () => ({ limit: async () => ({ data: requests, error: null }) }) });
});

it("renders matching only for open unmatched lines without an initial inventory catalog", async () => {
  mocks.requireRole.mockResolvedValue({ role: "admin" });
  render(await Page({ searchParams: Promise.resolve({}) }));

  expect(mocks.from.mock.calls).toEqual([["material_requests"]]);
  expect(mocks.select.mock.calls[0][0]).toContain("inventory_item_id");
  expect(screen.getByRole("button", { name: "Match Item · Window Handle" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Match Item · Previously approved bracket" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Match Item · Linked material" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Match Item · Rejected material" })).toBeNull();
  expect(screen.queryByRole("searchbox")).toBeNull();
});

it("lets management viewers read requests without displaying matching or loading inventory options", async () => {
  mocks.requireRole.mockResolvedValue({ role: "management_viewer" });
  render(await Page({ searchParams: Promise.resolve({}) }));

  expect(screen.getByText("MR-001")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Match Item/ })).toBeNull();
  expect(mocks.from.mock.calls).toEqual([["material_requests"]]);
});
