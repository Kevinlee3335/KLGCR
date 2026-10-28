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
    is: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.is.mockReturnValue(builder);
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
const storage = vi.hoisted(() => ({ sign: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn((table: string) => queries.get(table)),
    storage: { from: () => ({ createSignedUrls: storage.sign }) },
  }),
}));

import AdminJobDetail from "./page";

describe("Admin Job Detail", () => {
  beforeEach(() => {
    queries.clear();
    storage.sign.mockReset();
    queries.set("maintenance_jobs", query({ data: job, error: null }));
    queries.set("appointments", query({ data: [], error: { message: "relationship unavailable" } }));
    queries.set("job_status_history", query({ data: null, error: { message: "history unavailable" } }));
    queries.set("material_requests", query({ data: null, error: { message: "materials unavailable" } }));
    queries.set("profiles", query({data:[],error:null}));
    queries.set("job_assignment_history", query({data:[],error:null}));
    queries.set("maintenance_job_photos", query({data:[],error:null}));
  });

  it("shows monitoring outcomes for admins", async () => {
    queries.set("maintenance_jobs", query({data:{...job,status:"under_monitoring",monitoring_note:"Observe the leak"},error:null}));
    const html=renderToStaticMarkup(await AdminJobDetail({params:Promise.resolve({id:job.id})}));
    expect(html).toContain("Confirm Completed");
    expect(html).toContain("Return to In Progress");
    expect(html).toContain("Next follow-up date");
  });

  it("renders the job and timeline when optional activity queries return no data", async () => {
    const html = renderToStaticMarkup(await AdminJobDetail({ params: Promise.resolve({ id: job.id }) }));

    expect(html).toContain("JOB-2026-0001");
    expect(html).toContain("Job Activity Timeline");
    expect(html).toContain("Job Assigned");
    expect(html).not.toContain("Maintenance Appointment");
    expect(html).toContain("Add Appointment");
  });

  it("shows appointment details and management controls when an active appointment exists", async () => {
    queries.set("appointments", query({ data: [{ id: "appointment-id", appointment_date: "2026-09-12", appointment_time: "09:30:00", status: "confirmed", remarks: "Call first", created_at: "2026-09-10T00:00:00Z", staff: { full_name: "Alex Staff" } }], error: null }));
    const html = renderToStaticMarkup(await AdminJobDetail({ params: Promise.resolve({ id: job.id }) }));
    expect(html).toContain("Manage / Reschedule Appointment");
    expect(html).toContain("2026-09-12");
    expect(html).toContain("Job Activity Timeline");
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

  it("keeps completion evidence attached to the timeline in original order", async () => {
    queries.set("maintenance_jobs",query({data:{...job,status:"completed",completed_at:"2026-10-12T03:00:00Z"},error:null}));
    queries.set("maintenance_job_photos",query({data:[
      {id:"photo-1",storage_path:"first.jpg",created_at:"2026-10-12T02:59:00Z"},
      {id:"photo-2",storage_path:"second.jpg",created_at:"2026-10-12T02:59:30Z"},
    ],error:null}));
    storage.sign.mockResolvedValue({data:[
      {path:"second.jpg",signedUrl:"https://evidence.example/second.jpg",error:null},
      {path:"first.jpg",signedUrl:"https://evidence.example/first.jpg",error:null},
    ],error:null});
    const html=renderToStaticMarkup(await AdminJobDetail({params:Promise.resolve({id:job.id})}));
    expect(html).toContain("Completed");
    expect(html.indexOf('href="https://evidence.example/first.jpg"')).toBeGreaterThan(-1);
    expect(html.indexOf('href="https://evidence.example/first.jpg"')).toBeLessThan(html.indexOf('href="https://evidence.example/second.jpg"'));
    expect(html).not.toContain("Some completion photos could not be loaded");
  });

  it("reports a missing photo without hiding the job or its valid evidence", async () => {
    queries.set("maintenance_jobs",query({data:{...job,status:"completed",completed_at:"2026-10-12T03:00:00Z"},error:null}));
    queries.set("maintenance_job_photos",query({data:[
      {id:"photo-1",storage_path:"missing.jpg",created_at:"2026-10-12T02:59:00Z"},
      {id:"photo-2",storage_path:"valid.jpg",created_at:"2026-10-12T02:59:30Z"},
    ],error:null}));
    storage.sign.mockResolvedValue({data:[
      {path:"missing.jpg",signedUrl:null,error:"not found"},
      {path:"valid.jpg",signedUrl:"https://evidence.example/valid.jpg",error:null},
    ],error:null});
    const html=renderToStaticMarkup(await AdminJobDetail({params:Promise.resolve({id:job.id})}));
    expect(html).toContain(job.job_no);
    expect(html).toContain("Some completion photos could not be loaded");
    expect(html).toContain('href="https://evidence.example/valid.jpg"');
  });
});
