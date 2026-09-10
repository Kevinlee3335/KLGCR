import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireRole: vi.fn().mockResolvedValue({ id: "admin-id", role: "admin" }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/phase2-ui", () => ({
  JobList: ({ rows }: { rows: Array<{ job_no: string; appointments?: unknown[] }> }) =>
    <div>{rows.map((row) => <span key={row.job_no}>{row.job_no}: {row.appointments?.length || 0} appointments</span>)}</div>,
}));

function query(result: unknown) {
  const builder = {
    select: vi.fn(), order: vi.fn(), eq: vi.fn(), in: vi.fn(), gte: vi.fn(), lt: vi.fn(),
    or: vi.fn(), range: vi.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  Object.values(builder).forEach((method) => {
    if (typeof method === "function" && method !== builder.then) vi.mocked(method).mockReturnValue(builder as never);
  });
  return builder;
}

const job = {
  id: "job-id", job_no: "JOB-001", room_no: "101", category: "Plumbing", description: "Leak",
  priority: "normal", status: "assigned", assigned_at: "2026-09-09T00:00:00Z", updated_at: "2026-09-09T00:00:00Z",
  complaint: { id: "complaint-id", complaint_no: "CMP-001" }, block: { id: 1, code: "A" }, assignee: null,
};
const jobsQuery = query({ data: [job], error: null });

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === "maintenance_jobs") return jobsQuery;
      if (table === "appointments") return query({ data: [], error: null });
      return query({ data: [], error: null });
    }),
  }),
}));

import JobsPage from "./page";

describe("Maintenance Jobs", () => {
  it("loads a job with no appointment without requesting a jobs-to-appointments relationship", async () => {
    const page = await JobsPage({ searchParams: Promise.resolve({}) });

    expect(renderToStaticMarkup(page)).toContain("JOB-001: 0 appointments");
    expect(jobsQuery.select).toHaveBeenCalledOnce();
    expect(jobsQuery.select.mock.calls[0][0]).not.toContain("appointments(");
  });
});
