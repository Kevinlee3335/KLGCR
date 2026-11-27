// @vitest-environment node
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireRole } from "@/lib/auth";
import ReportsPage from "./page";

const tables = new Map<string, ReturnType<typeof query>>();
function query(result: unknown) {
  const chain = {
    select: vi.fn(), order: vi.fn(), eq: vi.fn(), limit: vi.fn(), range: vi.fn(), gte: vi.fn(), lt: vi.fn(), returns: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const fn of Object.values(chain)) if (vi.isMockFunction(fn)) fn.mockReturnValue(chain);
  return chain;
}
const from = vi.fn((name: string) => tables.get(name));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from }) }));
vi.mock("@/lib/auth", () => ({ requireRole: vi.fn() }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

function report(index: number) {
  return { id: String(index), created_at: "2026-11-27T01:30:00Z", report_type: "morning_tasks", block_group: "AB", source: "scheduled", whatsapp_text: `Report body number ${index}.` };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ role: "admin" } as Awaited<ReturnType<typeof requireRole>>);
  for (const name of ["report_snapshots", "profiles", "appointments", "inventory_issue_history", "inventory_adjustment_history"])
    tables.set(name, query({ data: [], error: null }));
});

async function render(params: Record<string, string> = {}, chunk?: (html: string) => void) {
  const element = await ReportsPage({ searchParams: Promise.resolve(params) });
  return new Promise<string>((resolve, reject) => {
    const output = new PassThrough();
    let html = "";
    output.setEncoding("utf8").on("data", text => { html += text; chunk?.(html); });
    output.on("end", () => resolve(html));
    const stream = renderToPipeableStream(<html><body>{element}</body></html>, { onShellReady: () => stream.pipe(output), onError: reject });
  });
}

describe("Reports navigation", () => {
  it("streams real report content, exports and filters while the staff and inventory reads are pending", async () => {
    let finish!: (value: unknown) => void;
    const slow = new Promise(resolve => { finish = resolve; });
    tables.set("profiles", query(slow));
    for (const table of ["appointments", "inventory_adjustment_history", "inventory_issue_history"]) tables.set(table, query(slow));
    tables.set("report_snapshots", query({ data: [report(1)] }));
    let html = "";
    const done = render({ staff: "current-employee" }, next => { html = next; });
    try {
      await vi.waitFor(() => expect(html).toContain("Report body number 1."));
      expect(html).toContain("Generate Now");
      expect(html).toContain("dataset=reports");
      expect(html).toContain('name="staff" value="current-employee"');
      expect(html).not.toContain("No inventory adjustments yet");
    } finally { finish({ data: [] }); await done; }
    expect(from.mock.calls.filter(([name]) => name === "inventory_issue_history")).toHaveLength(1);
    expect(tables.get("inventory_adjustment_history")!.limit).toHaveBeenCalledWith(50);
  });

  it("loads ten complete reports per page, checks for an older page, and preserves all filters on paging and export", async () => {
    const history = query({ data: Array.from({ length: 11 }, (_, i) => report(i + 11)) });
    tables.set("report_snapshots", history);
    const html = await render({ page: "2", date: "2026-11-27", block: "AB", staff: "person", reportType: "morning_tasks" });
    expect(history.range).toHaveBeenCalledWith(10, 20);
    expect(history.eq).toHaveBeenCalledWith("report_date", "2026-11-27");
    expect(history.eq).toHaveBeenCalledWith("block_group", "AB");
    expect(history.eq).toHaveBeenCalledWith("report_type", "morning_tasks");
    expect(html).toContain("Report body number 20.");
    expect(html).not.toContain("Report body number 21.");
    expect(html).toContain('href="/admin/reports?date=2026-11-27&amp;block=AB&amp;staff=person&amp;reportType=morning_tasks&amp;page=3"');
    expect(html).toContain("Newer reports");
    expect(html).toContain('reportType=morning_tasks&amp;dataset=reports&amp;format=csv');
    expect(tables.get("inventory_issue_history")!.eq).toHaveBeenCalledWith("staff_id", "person");
  });

  it("keeps generation admin-only and distinguishes unavailable data from an empty history", async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: "management_viewer" } as Awaited<ReturnType<typeof requireRole>>);
    tables.set("report_snapshots", query({ data: null, error: { message: "unavailable" } }));
    const html = await render({ page: "-3" });
    expect(requireRole).toHaveBeenCalledWith(["admin", "management_viewer"]);
    expect(html).not.toContain("Generate Now");
    expect(html).toContain("Report history could not be loaded");
    expect(html).not.toContain("No reports yet");
    expect(tables.get("report_snapshots")!.range).toHaveBeenCalledWith(0, 10);
  });
});
