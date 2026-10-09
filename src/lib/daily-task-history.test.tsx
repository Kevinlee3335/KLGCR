import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ calls: [] as Array<{ table: string; method: string; args: unknown[] }>, role: "admin", taskError: null as null | { message: string } }));
vi.mock("@/lib/auth", () => ({ requireRole: async () => ({ id: "staff-id", role: mocks.role, full_name: "Staff" }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/daily-task-form", () => ({ DailyTaskForm: () => null }));
vi.mock("@/components/admin-daily-task-controls", () => ({ AdminDailyTaskControls: () => null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  rpc: async () => ({ error: null }),
  from: (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "is", "not", "or", "order", "limit", "gte", "lte"]) chain[method] = (...args: unknown[]) => { mocks.calls.push({ table, method, args }); return chain; };
    chain.then = (resolve: (result: unknown) => void) => resolve({ data: [], error: table === "admin_daily_tasks" ? mocks.taskError : null });
    return chain;
  },
}) }));
import AdminTasks from "@/app/(dashboard)/admin/daily-tasks/page";
import StaffTasks from "@/app/(dashboard)/staff/daily-tasks/page";
import StaffDashboard from "@/app/(dashboard)/staff/page";
beforeEach(() => { mocks.calls.length = 0; mocks.role = "admin"; mocks.taskError = null; });
const dateCalls = () => mocks.calls.filter(c => c.table === "admin_daily_tasks" && c.method === "eq" && c.args[0] === "task_date");
describe("Daily Task history visibility", () => {
  it.each(["admin", "operation", "housekeeping"])("keeps all dates visible by default for %s", async category => {
    renderToStaticMarkup(await AdminTasks({ searchParams: Promise.resolve({ category }) }));
    expect(dateCalls()).toHaveLength(0);
    expect(mocks.calls).toContainEqual({ table: "admin_daily_tasks", method: "eq", args: ["task_category", category] });
  });
  it("honors an explicit historical date", async () => {
    renderToStaticMarkup(await AdminTasks({ searchParams: Promise.resolve({ category: "admin", date: "2026-10-08" }) }));
    expect(dateCalls()[0].args).toEqual(["task_date", "2026-10-08"]);
  });
  it("reports query errors instead of saying there are no tasks", async () => {
    mocks.taskError = { message: "permission denied" };
    const html = renderToStaticMarkup(await AdminTasks({ searchParams: Promise.resolve({ category: "admin" }) }));
    expect(html).toContain("Unable to load task records");
    expect(html).not.toContain("No admin task in the records");
  });
  it("keeps staff history restricted to the assignee without a default date filter", async () => {
    mocks.role = "cleaner";
    renderToStaticMarkup(await StaffTasks({ searchParams: Promise.resolve({}) }));
    expect(dateCalls()).toHaveLength(0);
    expect(mocks.calls).toContainEqual({ table: "admin_daily_tasks", method: "eq", args: ["assigned_to", "staff-id"] });
  });
  it("combines admin search, date range, staff and status", async () => {
    const staff = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    renderToStaticMarkup(await AdminTasks({ searchParams: Promise.resolve({ category: "operation", q: "pump", from: "2026-10-01", to: "2026-10-09", assignedTo: staff, status: "accepted" }) }));
    expect(mocks.calls).toContainEqual({ table: "admin_daily_tasks", method: "or", args: ['title.ilike."%pump%",notes.ilike."%pump%"'] });
    expect(mocks.calls).toContainEqual({ table: "admin_daily_tasks", method: "gte", args: ["task_date", "2026-10-01"] });
    expect(mocks.calls).toContainEqual({ table: "admin_daily_tasks", method: "lte", args: ["task_date", "2026-10-09"] });
    expect(mocks.calls).toContainEqual({ table: "admin_daily_tasks", method: "eq", args: ["assigned_to", staff] });
    expect(mocks.calls).toContainEqual({ table: "admin_daily_tasks", method: "in", args: ["status", ["accepted"]] });
  });
  it("keeps cleaner searches restricted to their own tasks", async () => {
    mocks.role = "cleaner";
    renderToStaticMarkup(await StaffTasks({ searchParams: Promise.resolve({ q: "clean", status: "completed", assignedTo: "other-user" }) }));
    expect(mocks.calls.filter(c => c.table === "admin_daily_tasks" && c.method === "eq" && c.args[0] === "assigned_to").map(c => c.args[1])).toEqual(["staff-id"]);
    expect(mocks.calls).toContainEqual({ table: "admin_daily_tasks", method: "eq", args: ["status", "completed"] });
  });
  it("includes overdue unfinished work on the cleaner dashboard", async () => {
    mocks.role = "cleaner";
    const dashboard = await StaffDashboard();
    const renderDashboard = dashboard.type as unknown as (props: typeof dashboard.props) => Promise<React.ReactNode>;
    renderToStaticMarkup(await renderDashboard(dashboard.props));
    const filter = mocks.calls.find(c => c.table === "admin_daily_tasks" && c.method === "or");
    expect(filter?.args[0]).toMatch(/^task_date.eq.\d{4}-\d{2}-\d{2},and\(task_date.lt.\d{4}-\d{2}-\d{2},status.neq.completed\)$/);
  });
});
