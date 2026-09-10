import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "staff", role: "maintenance_staff", full_name: "Staff", blocks: [] }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/phase2-ui", () => ({ JobList: ({ rows }: { rows: Array<{job_no:string;appointments?:unknown[]}> }) => <div>{rows.map(row => <span key={row.job_no}>{row.job_no}:{row.appointments?.length || 0}</span>)}</div> }));

function query(result: unknown) {
  const builder = { select: vi.fn(), order: vi.fn(), eq: vi.fn(), in: vi.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
  builder.select.mockReturnValue(builder); builder.order.mockReturnValue(builder); builder.eq.mockReturnValue(builder); builder.in.mockReturnValue(builder);
  return builder;
}
const jobsQuery = query({ data: [
  { id:"one", job_no:"JOB-ONE", status:"assigned", complaint:{id:"c1",complaint_no:"CMP-1"} },
  { id:"two", job_no:"JOB-TWO", status:"completed", complaint:{id:"c2",complaint_no:"CMP-2"} },
], error:null });
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({ from: vi.fn((table:string) => table === "maintenance_jobs" ? jobsQuery : query({data:[{complaint_id:"c1",appointment_date:"2026-09-10",appointment_time:"09:00:00",status:"confirmed"}],error:null})) }) }));

import Tasks from "./page";

describe("staff tasks", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([{status:undefined,label:"Current tasks"},{status:"completed",label:"Completed"}])("loads $label without the removed complaint column", async ({status}) => {
    const page = await Tasks({searchParams:Promise.resolve(status ? {status} : {})});
    const html = renderToStaticMarkup(page);
    expect(html).toContain("JOB-ONE:1");
    expect(html).toContain("JOB-TWO:0");
    expect(jobsQuery.select.mock.calls.at(-1)?.[0]).not.toContain("appointment_required");
    expect(jobsQuery.select.mock.calls.at(-1)?.[0]).not.toContain("appointments(");
  });
});
