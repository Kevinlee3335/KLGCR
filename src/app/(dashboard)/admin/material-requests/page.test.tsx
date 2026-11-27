import { Children, isValidElement, Suspense, type ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import Page from "./page";
import { MaterialRequestResults } from "./material-request-results";

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

function mockRequests(data: typeof requests, { waitForTotals = Promise.resolve(), listError = "" } = {}) {
  mocks.from.mockImplementation(() => ({ select: mocks.select }));
  mocks.select.mockImplementation((_columns, options) => {
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
        if (listError) return { data: null, count: null, error: { message: listError } };
        return { data: selected.slice(from, to + 1), count: options?.count === "exact" ? selected.length : null, error: null };
      },
      then: (resolve: (value: unknown) => unknown) => waitForTotals.then(() => resolve({ count: selected.length, error: null })),
    };
    return builder;
  });
}

it("renders matching only for open unmatched lines without an initial inventory catalog", async () => {
  const isAdmin = true;
  render(await MaterialRequestResults({ isAdmin, query: {} }));

  expect(mocks.from.mock.calls).toEqual(Array(3).fill(["material_requests"]));
  expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining("inventory_item_id"), { count: "exact" });
  expect(screen.getByRole("button", { name: "Match Item · Window Handle" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Match Item · Previously approved bracket" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Match Item · Linked material" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Match Item · Rejected material" })).toBeNull();
  expect(screen.queryByRole("searchbox")).toBeNull();
});

it("lets management viewers read requests without displaying matching or loading inventory options", async () => {
  const isAdmin = false;
  render(await MaterialRequestResults({ isAdmin, query: {} }));

  expect(screen.getByText("MR-001")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Match Item/ })).toBeNull();
  expect(mocks.from.mock.calls).toEqual(Array(3).fill(["material_requests"]));
});

it("makes every summary card a filter with an active state and global counts", async () => {
  const isAdmin = true;
  render(await MaterialRequestResults({ isAdmin, query: { status: "pending" } }));
  const filters = screen.getByRole("navigation", { name: "Filter material requests" });
  expect(within(filters).getByRole("link", { name: /Pending Review 1/ })).toHaveAttribute("href", "/admin/material-requests?status=pending");
  expect(within(filters).getByRole("link", { name: /Pending Review/ })).toHaveAttribute("aria-current", "page");
  expect(within(filters).getByRole("link", { name: /Approved 1/ })).toHaveAttribute("href", "/admin/material-requests?status=approved");
  expect(within(filters).getByRole("link", { name: /Total Records 3/ })).toHaveAttribute("href", "/admin/material-requests?status=all");
  expect(screen.getByText("MR-001")).toBeInTheDocument();
  expect(screen.queryByText("MR-002")).toBeNull();
  expect(screen.queryByText("MR-003")).toBeNull();
  expect(mocks.select.mock.calls.filter(([columns]) => columns === "id")).toEqual(Array(2).fill(["id", { count: "exact", head: true }]));
});

it("retrieves pending requests older than the latest 100 records and paginates within the filter", async () => {
  const isAdmin = false;
  mockRequests([
    ...Array.from({ length: 120 }, (_, index) => ({ ...requests[2], id: `issued-${index}`, request_no: `ISSUED-${index}`, status: "issued" })),
    ...Array.from({ length: 26 }, (_, index) => ({ ...requests[0], id: `pending-${index}`, request_no: `PENDING-${index}` })),
  ]);
  render(await MaterialRequestResults({ isAdmin, query: { status: "pending", page: "2" } }));
  expect(screen.getByText("PENDING-25")).toBeInTheDocument();
  expect(screen.queryByText("ISSUED-0")).toBeNull();
  expect(screen.queryByText("PENDING-0")).toBeNull();
  expect(screen.getByText("26 requests · Showing 26–26")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("href", "/admin/material-requests?status=pending&page=1");
  expect(screen.queryByRole("link", { name: "Next" })).toBeNull();
  expect(mocks.range).toHaveBeenCalledWith(25, 49);
});

it("shows only approved requests and keeps the total card available", async () => {
  const isAdmin = false;
  render(await MaterialRequestResults({ isAdmin, query: { status: "approved", page: "9999" } }));
  expect(screen.getByText("MR-002")).toBeInTheDocument();
  expect(screen.queryByText("MR-001")).toBeNull();
  expect(screen.getByRole("link", { name: "Clear filter" })).toHaveAttribute("href", "/admin/material-requests?status=all");
  expect(mocks.range).toHaveBeenCalledWith(0, 24);
});

it("shows a clear empty state for pending review", async () => {
  const isAdmin = true;
  mockRequests([requests[1]]);
  render(await MaterialRequestResults({ isAdmin, query: { status: "pending" } }));
  expect(screen.getByText("No requests waiting for approval.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Pending Review 0/ })).toBeInTheDocument();
});

it("handles invalid filters and page numbers as the first page of all requests", async () => {
  const isAdmin = false;
  render(await MaterialRequestResults({ isAdmin, query: { status: "invalid", page: "-5" } }));
  expect(screen.getByText("MR-001")).toBeInTheDocument();
  expect(screen.getByText("MR-003")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Total Records/ })).toHaveAttribute("aria-current", "page");
  expect(mocks.range).toHaveBeenCalledWith(0, 24);
});

it("starts the first page while the other filter counts are still pending", async () => {
  const isAdmin = true;
  let releaseTotals!: () => void;
  mockRequests(requests, { waitForTotals: new Promise<void>(resolve => { releaseTotals = resolve; }) });
  const loading = MaterialRequestResults({ isAdmin, query: {} });
  try {
    await vi.waitFor(() => expect(mocks.range).toHaveBeenCalledWith(0, 24));
  } finally {
    releaseTotals();
    await loading;
  }
});

it("still shows the global totals when the detail query fails", async () => {
  const isAdmin = true;
  mockRequests(requests, { listError: "Unable to load material details" });
  render(await MaterialRequestResults({ isAdmin, query: { status: "pending" } }));
  expect(screen.getByText("Unable to load material details")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Pending Review 1/ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Total Records 3/ })).toBeInTheDocument();
  expect(screen.queryByText("No requests waiting for approval.")).toBeNull();
});

it("renders the authorized page heading, notices and loading state before starting its queries", async () => {
  mocks.requireRole.mockResolvedValue({ role: "management_viewer" });
  const page = await Page({ searchParams: Promise.resolve({ success: "1" }) });
  const children = Children.map(page.props.children, child =>
    isValidElement<{ fallback: ReactNode }>(child) && child.type === Suspense ? child.props.fallback : child
  );
  render(<>{children}</>);
  expect(mocks.requireRole).toHaveBeenCalledWith(["admin", "management_viewer"]);
  expect(screen.getByRole("heading", { name: "Material Requests" })).toBeInTheDocument();
  expect(screen.getByText("Request updated successfully.")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Loading material requests");
  expect(mocks.from).not.toHaveBeenCalled();
});
