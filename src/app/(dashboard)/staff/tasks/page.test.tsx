// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { streamPage } from "@/test/stream-page";
import Tasks from "./page";

const db = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "staff", role: "maintenance_staff", blocks: [] }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/lib/supabase/server", () => ({ createClient: db }));
it.each([{}, {status:"completed",page:"2"}])("opens the status filter before the staff-scoped job page, then jobs before their complaint appointments", async filters => {
  const requests: URL[] = [];
  let finish!: (rows: unknown[]) => void, appointments!: (rows: unknown[]) => void;
  db.mockResolvedValue(createClient("https://jobs.example","fixture", { global: { fetch(input) {
    requests.push(new URL(String(input)));
    return new Promise(resolve => {
      const respond = (rows: unknown[]) => resolve(Response.json(rows));
      if (new URL(String(input)).pathname.endsWith("/appointments")) appointments = respond;
      else finish = respond;
    });
  } } }));
  const page = streamPage(await Tasks({searchParams: Promise.resolve(filters)}));
  try {
    await vi.waitFor(() => expect(page.html()).toContain("Current reports"));
    expect(requests).toHaveLength(1);
    const q = requests[0].searchParams;
    expect(q.get("status")).toBe(filters.status ? "eq.completed" : "in.(assigned,in_progress,waiting_checkout)");
    expect(q.get("offset")).toBe(filters.page ? "50" : "0");
    expect(q.get("assigned_to")).toBe("eq.staff");
    expect(q.get("select")).toContain("availability_date,availability_time,room_access_permission");
    expect(q.get("select")).not.toContain("appointment_required");
    finish(Array.from({length:51}, (_,i) => ({id:"id-"+i, job_no:"JOB-"+i, complaint:i<2 ? {id:"complaint-one"}:null, status:"assigned",priority:"normal",
      room_no:"A1",category:"Fixture",description:"Fixture job",assigned_to:"staff",assigned_at:"2026-11-01T02:00:00Z",updated_at:"2026-11-01T02:00:00Z"})));
    await vi.waitFor(() => expect(page.html()).toContain("JOB-49"));
    expect(page.html()).toContain("/staff/jobs/id-0?");
    expect(requests[1].searchParams.get("complaint_id")).toBe("in.(complaint-one)");
    expect(page.html()).not.toContain("2026-12-02 09:30");
    appointments(["cancelled","no_show","confirmed","completed"].map((status,i) => ({complaint_id:"complaint-one",status,appointment_date:"2026-12-02",appointment_time:i===2?"09:30:00":"13:00:00"})));
    await vi.waitFor(() => expect(page.html()).toContain("2026-12-02 09:30"));
    expect(page.html()).not.toContain("2026-12-02 13:00");
    expect(page.html()).not.toContain("JOB-50");
    expect(page.html()).toContain(filters.page ? "status=completed&amp;page=3" : "/staff/tasks?page=2");
    expect(page.errors).toEqual([]);
  } finally {page.close();}
});
