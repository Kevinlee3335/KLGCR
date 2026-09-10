import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireRole: vi.fn().mockResolvedValue({ id: "admin-id", role: "admin" }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

function query(result: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.maybeSingle.mockReturnValue(builder);
  return builder;
}

const job = {
  id: "job-id",
  job_no: "JOB-2026-0001",
  room_no: "101",
  category: "Plumbing",
  description: "Leaking tap",
  priority: "normal",
  status: "assigned",
  assigned_at: "2026-09-09T00:00:00Z",
  updated_at: "2026-09-09T00:00:00Z",
  started_at: null,
  completed_at: null,
  action_taken: null,
  monitoring_note: null,
  monitoring_started_at: null,
  monitoring_review_at: null,
  pending_material_note: null,
  block: { id: 1, code: "A" },
  assignee: null,
  complaint: {
    complaint_no: "CMP-2026-0001",
    complainant_name: null,
    complainant_contact: null,
    availability_date: null,
    availability_time: null,
    room_access_permission: "yes",
    submitted_at: null,
    reviewed_at: null,
    reviewer: null,
  },
};

const queries = new Map<string, ReturnType<typeof query>>();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn((table: string) => queries.get(table)),
  }),
}));

import AdminJobDetail from "./page";

describe("Admin Job Detail", () => {
  beforeEach(() => {
    queries.clear();
    queries.set("maintenance_jobs", query({ data: job, error: null }));
    queries.set("appointments", query({ data: [], error: { message: "relationship unavailable" } }));
    queries.set("job_status_history", query({ data: null, error: { message: "history unavailable" } }));
    queries.set("material_requests", query({ data: null, error: { message: "materials unavailable" } }));
  });

  it("renders the job and timeline when optional activity queries return no data", async () => {
    const html = renderToStaticMarkup(await AdminJobDetail({ params: Promise.resolve({ id: job.id }) }));

    expect(html).toContain("JOB-2026-0001");
    expect(html).toContain("Job Activity Timeline");
    expect(html).toContain("Job Assigned");
    expect(html).not.toContain("Maintenance Appointment");
  });

  it("uses schema-defined foreign-key constraints for every new timeline relationship", async () => {
    await AdminJobDetail({ params: Promise.resolve({ id: job.id }) });

    expect(queries.get("appointments")?.select.mock.calls[0][0]).toContain("appointments_assigned_staff_fkey");
    expect(queries.get("job_status_history")?.select.mock.calls[0][0]).toContain("job_status_history_changed_by_fkey");
    const materialsSelect = queries.get("material_requests")?.select.mock.calls[0][0];
    expect(materialsSelect).toContain("material_requests_requested_by_fkey");
    expect(materialsSelect).toContain("material_requests_reviewed_by_fkey");
    expect(materialsSelect).toContain("material_requests_issued_by_fkey");
    expect(materialsSelect).toContain("material_request_items_request_id_fkey");
    expect(materialsSelect).toContain("material_request_items_inventory_item_id_fkey");
  });
});
