// @vitest-environment node
import { prerender } from "react-dom/static";
import { beforeEach, expect, it, vi } from "vitest";
import CleanerReports from "./complaints/page";
import { historyPage } from "./history-navigation";

const mocks = vi.hoisted(() => ({ range: vi.fn(), eq: vi.fn(), requireRole: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const query = { select: () => query, eq: mocks.eq, order: () => query, range: mocks.range };
    mocks.eq.mockReturnValue(query);
    return { from: () => query };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({ id: "cleaner", role: "cleaner" });
});

async function reports(page: string) {
  const result = await prerender(await CleanerReports({searchParams: Promise.resolve({ page })}));
  return new Response(result.prelude).text();
}

it("keeps cleaning report history accessible without loading every description on entry", async () => {
  const rows = Array.from({length: 51}, (_, i) => ({
    id: i, complaint_no: `CMP-${51 + i}.`, room_no: "111", category: "Plumbing", description: "Leak",
    status: "closed", submitted_at: "2026-11-27T09:00:00Z",
  }));
  mocks.range.mockResolvedValue({data: rows, error: null});
  const html = await reports("2");
  expect(mocks.requireRole).toHaveBeenCalledWith(["cleaner"]);
  expect(mocks.eq).toHaveBeenCalledWith("source", "cleaning");
  expect(mocks.range).toHaveBeenCalledWith(50,100);
  expect(html).toContain("CMP-51.");
  expect(html).toContain("CMP-100.");
  expect(html).not.toContain("CMP-101.");
  expect(html).toContain("completed");
  expect(html).toContain('href="/staff/complaints?page=3"');
  expect(html).toContain('href="/staff/complaints"');
});

it("starts invalid pages at one and distinguishes failed queries from empty reports", async () => {
  expect(historyPage(["1","2"])).toBe(1);
  expect(historyPage("100000000000000000")).toBe(1);
  mocks.range.mockResolvedValue({data:null,error:{message:"Unavailable"}});
  const html=await reports("-1");
  expect(mocks.range).toHaveBeenCalledWith(0,50);
  expect(html).toContain("Unavailable");
  expect(html).not.toContain("No reports submitted");
});
