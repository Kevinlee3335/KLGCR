import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import Page from "./page";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), range: vi.fn() }));
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
  vi.clearAllMocks();
  mockRequests(requests);
});

function mockRequests(data: typeof requests) {
  mocks.from.mockImplementation(() => ({ select: mocks.select }));
  mocks.select.mockImplementation(() => {
    let selected = data;
    const builder = {
      eq: (field: string, value: string) => {
        mocks.eq(field, value);
        selected = selected.filter(row => row.status === value);
        return builder;
      },
      order: () => builder,
      range: async (from: number, to: number) => {
        mocks.range(from, to);
        return { data: selected.slice(from, to + 1), error: null };
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count: selected.length, error: null }).then(resolve),
    };
    return builder;
  });
}

it("renders matching only for open unmatched lines without an initial inventory catalog", async () => {
  mocks.requireRole.mockResolvedValue({ role: "admin" });
  render(await Page({ searchParams: Promise.resolve({}) }));

  expect(mocks.from.mock.calls).toEqual(Array(4).fill(["material_requests"]));
  expect(mocks.select.mock.calls[3][0]).toContain("inventory_item_id");
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
  expect(mocks.from.mock.calls).toEqual(Array(4).fill(["material_requests"]));
});

it("makes every summary card a filter with an active state and global counts", async () => {
  mocks.requireRole.mockResolvedValue({ role: "admin" });
  render(await Page({ searchParams: Promise.resolve({ status: "pending" }) }));
  const filters = screen.getByRole("navigation", { name: "Filter material requests" });
  expect(within(filters).getByRole("link", { name: /Pending Review 1/ })).toHaveAttribute("href", "/admin/material-requests?status=pending");
  expect(within(filters).getByRole("link", { name: /Pending Review/ })).toHaveAttribute("aria-current", "page");
  expect(within(filters).getByRole("link", { name: /Approved 1/ })).toHaveAttribute("href", "/admin/material-requests?status=approved");
  expect(within(filters).getByRole("link", { name: /Total Records 3/ })).toHaveAttribute("href", "/admin/material-requests?status=all");
  expect(screen.getByText("MR-001")).toBeInTheDocument();
  expect(screen.queryByText("MR-002")).toBeNull();
  expect(screen.queryByText("MR-003")).toBeNull();
  expect(mocks.select.mock.calls.slice(0, 3)).toEqual(Array(3).fill(["id", { count: "exact", head: true }]));
});

it("retrieves pending requests older than the latest 100 records and paginates within the filter", async () => {
  mocks.requireRole.mockResolvedValue({ role: "management_viewer" });
  mockRequests([
    ...Array.from({ length: 120 }, (_, index) => ({ ...requests[2], id: `issued-${index}`, request_no: `ISSUED-${index}`, status: "issued" })),
    ...Array.from({ length: 26 }, (_, index) => ({ ...requests[0], id: `pending-${index}`, request_no: `PENDING-${index}` })),
  ]);
  render(await Page({ searchParams: Promise.resolve({ status: "pending", page: "2" }) }));
  expect(screen.getByText("PENDING-25")).toBeInTheDocument();
  expect(screen.queryByText("ISSUED-0")).toBeNull();
  expect(screen.queryByText("PENDING-0")).toBeNull();
  expect(screen.getByText("26 requests · Showing 26–26")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("href", "/admin/material-requests?status=pending&page=1");
  expect(screen.queryByRole("link", { name: "Next" })).toBeNull();
  expect(mocks.range).toHaveBeenCalledWith(25, 49);
});

it("shows only approved requests and keeps the total card available", async () => {
  mocks.requireRole.mockResolvedValue({ role: "management_viewer" });
  render(await Page({ searchParams: Promise.resolve({ status: "approved", page: "9999" }) }));
  expect(screen.getByText("MR-002")).toBeInTheDocument();
  expect(screen.queryByText("MR-001")).toBeNull();
  expect(screen.getByRole("link", { name: "Clear filter" })).toHaveAttribute("href", "/admin/material-requests?status=all");
  expect(mocks.range).toHaveBeenCalledWith(0, 24);
});

it("shows a clear empty state for pending review", async () => {
  mocks.requireRole.mockResolvedValue({ role: "admin" });
  mockRequests([requests[1]]);
  render(await Page({ searchParams: Promise.resolve({ status: "pending" }) }));
  expect(screen.getByText("No requests waiting for approval.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Pending Review 0/ })).toBeInTheDocument();
});

it("handles invalid filters and page numbers as the first page of all requests", async () => {
  mocks.requireRole.mockResolvedValue({ role: "management_viewer" });
  render(await Page({ searchParams: Promise.resolve({ status: "invalid", page: "-5" }) }));
  expect(screen.getByText("MR-001")).toBeInTheDocument();
  expect(screen.getByText("MR-003")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Total Records/ })).toHaveAttribute("aria-current", "page");
  expect(mocks.range).toHaveBeenCalledWith(0, 24);
});
