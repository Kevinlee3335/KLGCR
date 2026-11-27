import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ComplaintSummary } from "./complaint-summary";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));

const tables: string[] = [];
function mockEmptyReport() {
  vi.clearAllMocks();
  tables.length = 0;
  mocks.createClient.mockResolvedValue({
    from(table: string) {
      tables.push(table);
      const chain = {
        select: () => chain, eq: () => chain, gte: () => chain, lt: () => chain, order: () => chain,
        range: async () => ({ data: [], error: null }),
      };
      return chain;
    },
  });
}

describe("complaint report loading", () => {
  it("makes no report query before expansion and shares a result across repeated opens", async () => {
    mockEmptyReport();
    render(await ComplaintSummary({ blocks: [], filters: {} }));
    expect(mocks.createClient).not.toHaveBeenCalled();
    const details = screen.getByText("Report Summary").closest("details")!;
    fireEvent.click(screen.getByText("Report Summary"));
    expect(await screen.findByText("New reports received")).toBeVisible();
    fireEvent.click(screen.getByText("Report Summary"));
    fireEvent.click(screen.getByText("Report Summary"));
    expect(details).toHaveAttribute("open");
    expect(mocks.requireRole).toHaveBeenCalledWith(["admin", "management_viewer"]);
    expect(tables).toEqual(["complaints", "maintenance_jobs"]);
  });

  it("renders a requested date range already expanded without a second set of reads", async () => {
    mockEmptyReport();
    render(await ComplaintSummary({ from: "2026-11-01", to: "2026-11-25", blocks: [], filters: {} }));
    expect(screen.getByText("New reports received")).toBeVisible();
    expect(screen.getByLabelText("Summary to")).toHaveValue("2026-11-25");
    expect(tables).toEqual(["complaints", "maintenance_jobs"]);
    expect(mocks.requireRole).not.toHaveBeenCalled();
  });

  it("prevents deferred reads if the viewer no longer has access", async () => {
    mockEmptyReport();
    mocks.requireRole.mockRejectedValueOnce(new Error("Access denied"));
    render(await ComplaintSummary({ blocks: [], filters: {} }));
    fireEvent.click(screen.getByText("Report Summary"));
    expect(await screen.findByText(/Unable to load summary/)).toBeVisible();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
