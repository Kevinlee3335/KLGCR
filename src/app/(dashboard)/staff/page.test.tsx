// @vitest-environment node
import { prerender } from "react-dom/static";
import { streamPage } from "@/test/stream-page";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "staff", role: "maintenance_staff", full_name: "Staff Member", blocks: [{ code: "A" }] }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/dashboard", () => ({ Dashboard: () => <div>Dashboard loaded</div> }));

function query(result: unknown) {
  const builder = { select: vi.fn(), order: vi.fn(), limit: vi.fn(), eq: vi.fn(), is: vi.fn(), not: vi.fn(), in: vi.fn(), or: vi.fn(), like: vi.fn(), range: vi.fn(), lte: vi.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
  for (const method of ["select", "order", "limit", "eq", "is", "not", "in", "or", "like", "range", "lte"] as const) builder[method].mockReturnValue(builder);
  return builder;
}

const jobQueries: ReturnType<typeof query>[] = [];

let checkoutQuery: ReturnType<typeof query>;
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({ from: vi.fn((table: string) => {
  if (table === "maintenance_jobs") return { select: (columns: string) => {
    if (columns.includes("checkout_note")) return query({ data: [], count: 0, error: null });
    const index = columns === "status" ? 0 : columns.includes("cycle_changes:") ? 3 : columns.includes("follow_ups:") ? 2 : 1;
    return jobQueries[index].select(columns);
  } };
  if (table === "checkout_rooms") return checkoutQuery;
  return query({ data: [], error: null });
}) }) }));

import StaffPage from "./page";

async function fullPage() {
  const {prelude} = await prerender(await StaffPage());
  return (await new Response(prelude).text()).replaceAll("<!-- -->", "");
}

const returnedJob = {
  id: "reopened", job_no: "JOB-1", room_no: "101", description: "Floor leak", status: "in_progress",
  block: { code: "A" }, monitoring_note: null, monitoring_review_at: null,
  follow_ups: [{ id: 5, note: "Admin follow-up: Resident reported the seal is still leaking.", new_status: "in_progress", created_at: "2026-10-16T06:14:35Z" }],
  cycle_changes: [{ id: 4, created_at: "2026-10-14T03:25:58Z" }],
};

describe("staff dashboard", () => {
  beforeEach(() => {

    checkoutQuery = query({ count: 0, error: null });
    jobQueries.splice(0, jobQueries.length, query({ data: [{ status: "assigned" }], error: null }),
      query({ data: [], error: null }), query({ data: [], error: null }), query({ data: [], error: null }));
  });

  it("offers team appointment and job navigation while dashboard reads are pending", async () => {
    let release!: (result: unknown) => void;
    jobQueries[0] = query(new Promise(resolve => { release = resolve; }));
    const page = streamPage(await StaffPage());
    try {
      await vi.waitFor(() => expect(page.html()).toContain("View current tasks"));
      expect(page.html()).toContain("Open Calendar");
      release({data: [], error: null});
      expect(page.errors).toEqual([]);
    } finally { page.close(); }
  });

  it("loads without selecting complaints.appointment_required and hides the empty follow-up panel", async () => {
    const html = await fullPage();
    expect(html).toContain("Dashboard loaded");
    expect(html).not.toContain("Monitoring Follow-up");
    expect(html).not.toContain("Open assigned rooms");
    for (const jobQuery of jobQueries) expect(jobQuery.select.mock.calls.flat().join()).not.toContain("appointment_required");
  });

  it("shows an entry to active checkout repairs for the signed-in maintenance user", async () => {
    checkoutQuery = query({ count: 4, error: null });
    const html = await fullPage();
    expect(html).toContain('href="/staff/checkouts"');
    expect(html).toContain("4 rooms assigned to you for rectification.");
    expect(checkoutQuery.eq).toHaveBeenCalledWith("assigned_to", "staff");
    expect(checkoutQuery.eq).toHaveBeenCalledWith("status", "rectification");
    expect(checkoutQuery.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("shows due monitoring work and the current Admin return with its remark and timestamp", async () => {
    jobQueries[2] = query({ data: [{ ...returnedJob, id: "due", job_no: "JOB-2", status: "under_monitoring", follow_ups: [], monitoring_note: "Check seal", monitoring_review_at: "2020-01-01T00:00:00Z" }], error: null });
    jobQueries[3] = query({ data: [returnedJob, { ...returnedJob, id: "old-return", cycle_changes: [{ id: 6 }] }], error: null });
    const html = await fullPage();
    expect(html).toContain("Monitoring Follow-up");
    expect(html).toContain("Overdue");
    expect(html).toContain("Admin follow-up: Resident reported the seal is still leaking.");
    expect(html).toMatch(/16 Oct 2026 · 02:14:35\s*pm MYT/i);
    expect(html).toContain("/staff/jobs/reopened?from=%2Fstaff");
    expect(html).not.toContain("/staff/jobs/old-return");
    expect(jobQueries[2].eq).toHaveBeenCalledWith("assigned_to", "staff");
    expect(jobQueries[2].or).toHaveBeenCalledWith(expect.stringContaining("monitoring_review_at.is.null"));
    expect(jobQueries[3].eq).toHaveBeenCalledWith("assigned_to", "staff");
    expect(jobQueries[3].in).toHaveBeenCalledWith("status", ["in_progress", "pending_material"]);
  });
});
