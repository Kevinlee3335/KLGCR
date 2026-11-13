import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "staff", role: "maintenance_staff", full_name: "Staff Member", blocks: [{ code: "A" }] }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/dashboard", () => ({ Dashboard: () => <div>Dashboard loaded</div> }));

function query(result: unknown) {
  const builder = { select: vi.fn(), order: vi.fn(), limit: vi.fn(), eq: vi.fn(), not: vi.fn(), in: vi.fn(), or: vi.fn(), like: vi.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
  for (const method of ["select", "order", "limit", "eq", "not", "in", "or", "like"] as const) builder[method].mockReturnValue(builder);
  return builder;
}

const jobQueries: ReturnType<typeof query>[] = [];
let jobQueryIndex = 0;
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({ from: vi.fn((table: string) => table === "maintenance_jobs" ? jobQueries[jobQueryIndex++] : query({ data: [], error: null })) }) }));

import StaffPage from "./page";

const returnedJob = {
  id: "reopened", job_no: "JOB-1", room_no: "101", description: "Floor leak", status: "in_progress",
  block: { code: "A" }, monitoring_note: null, monitoring_review_at: null,
  follow_ups: [{ id: 5, note: "Admin follow-up: Resident reported the seal is still leaking.", new_status: "in_progress", created_at: "2026-10-16T06:14:35Z" }],
  cycle_changes: [{ id: 4, created_at: "2026-10-14T03:25:58Z" }],
};

describe("staff dashboard", () => {
  beforeEach(() => {
    jobQueryIndex = 0;
    jobQueries.splice(0, jobQueries.length, query({ data: [{ status: "assigned" }], error: null }),
      query({ data: [], error: null }), query({ data: [], error: null }), query({ data: [], error: null }));
  });

  it("loads without selecting complaints.appointment_required and hides the empty follow-up panel", async () => {
    const html = renderToStaticMarkup(await StaffPage());
    expect(html).toContain("Dashboard loaded");
    expect(html).not.toContain("Monitoring Follow-up");
    for (const jobQuery of jobQueries) expect(jobQuery.select.mock.calls.flat().join()).not.toContain("appointment_required");
  });

  it("shows due monitoring work and the current Admin return with its remark and timestamp", async () => {
    jobQueries[2] = query({ data: [{ ...returnedJob, id: "due", job_no: "JOB-2", status: "under_monitoring", follow_ups: [], monitoring_note: "Check seal", monitoring_review_at: "2020-01-01T00:00:00Z" }], error: null });
    jobQueries[3] = query({ data: [returnedJob, { ...returnedJob, id: "old-return", cycle_changes: [{ id: 6 }] }], error: null });
    const html = renderToStaticMarkup(await StaffPage());
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
