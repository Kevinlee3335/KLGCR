import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "staff-id", role: "maintenance_staff", full_name: "Alex Staff" }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/job-workflow-actions", () => ({ JobWorkflowActions: () => null }));

function query(result: unknown) {
  const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), single: vi.fn(), not: vi.fn(), limit: vi.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
  for (const method of ["select", "eq", "order", "single", "not", "limit"] as const) builder[method].mockReturnValue(builder);
  return builder;
}

const job = {
  id: "job-id", job_no: "JOB-1", room_no: "101", category: "Plumbing", description: "Leak", priority: "normal", status: "assigned",
  assigned_at: "2026-09-09T00:00:00Z", updated_at: "2026-09-09T00:00:00Z", started_at: null, completed_at: null, action_taken: null,
  monitoring_note: null, monitoring_started_at: null, monitoring_review_at: null, pending_material_note: null, block: { id: 1, code: "A" },
  complaint: { id: "complaint-id", complaint_no: "CMP-1", reporter_name: "Resident Name", reporter_phone: "0199999999", preferred_date: "2026-09-12", preferred_time: "10:00:00", complainant_name: null, complainant_contact: null, availability_date: null, availability_time: null, room_access_permission: "YES" },
};
const queries = new Map<string, ReturnType<typeof query>>();
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({ from: vi.fn((table: string) => queries.get(table)) }) }));
import StaffJob from "./page";

describe("Staff Job Detail", () => {
  beforeEach(() => {
    queries.clear();
    queries.set("maintenance_jobs", query({ data: job, error: null }));
    queries.set("material_requests", query({ data: [], error: null }));
    queries.set("appointments", query({ data: [], error: null }));
  });

  it("shows complaint reporter data without exposing email", async () => {
    const html = renderToStaticMarkup(await StaffJob({ params: Promise.resolve({ id: job.id }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("Reporter Information");
    expect(html).toContain("Resident Name"); expect(html).toContain("0199999999");
    expect(html).toContain("12 Sep 2026"); expect(html).toContain("10:00 AM"); expect(html).toContain("YES");
    const projection = queries.get("maintenance_jobs")?.select.mock.calls[0][0];
    expect(projection).toContain("maintenance_jobs_complaint_id_fkey"); expect(projection).not.toContain("reporter_email");
  });

  it("shows an active appointment from appointments", async () => {
    queries.set("appointments", query({ data: [{ appointment_date: "2026-09-14", appointment_time: "14:30:00", status: "confirmed", remarks: "Call first", staff: { full_name: "Alex Staff" } }], error: null }));
    const html = renderToStaticMarkup(await StaffJob({ params: Promise.resolve({ id: job.id }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("Maintenance Appointment"); expect(html).toContain("2026-09-14"); expect(html).toContain("14:30"); expect(html).toContain("confirmed"); expect(html).toContain("Call first");
    expect(queries.get("appointments")?.eq).toHaveBeenCalledWith("job_id", job.id);
  });

  it("omits an empty appointment card and tolerates null optional reporter fields", async () => {
    queries.set("maintenance_jobs", query({ data: { ...job, complaint: { ...job.complaint, reporter_name: null, reporter_phone: null, preferred_date: null, preferred_time: null, complainant_name: null, complainant_contact: null, availability_date: null, availability_time: null, room_access_permission: null } }, error: null }));
    const html = renderToStaticMarkup(await StaffJob({ params: Promise.resolve({ id: job.id }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("Reporter Information"); expect(html).not.toContain("Maintenance Appointment");
  });
});
