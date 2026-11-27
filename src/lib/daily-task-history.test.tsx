// @vitest-environment node

import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToPipeableStream, renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  role: "admin",
  taskError: null as null | { message: string },
  materialization: null as Promise<{ error: { message: string } | null }> | null,
  rows: new Map<string, unknown[] | Promise<unknown[]>>(),
}));
vi.mock("@/lib/auth", () => ({ requireRole: async () => ({ id: "staff-id", role: mocks.role, full_name: "Staff" }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  rpc: async (name: string, args: unknown) => { mocks.calls.push({ table: "rpc", method: name, args: [args] }); return mocks.materialization ?? { error: null }; },
  from: (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "is", "not", "or", "order", "limit", "range", "gte", "lte"]) chain[method] = (...args: unknown[]) => { mocks.calls.push({ table, method, args }); return chain; };
    chain.then = async (resolve: (result: unknown) => void) => {
      mocks.calls.push({ table, method: "execute", args: [] });
      return resolve({ data: await mocks.rows.get(table) ?? [], error: table === "admin_daily_tasks" ? mocks.taskError : null });
    };
    return chain;
  },
}) }));
import AdminTasks from "@/app/(dashboard)/admin/daily-tasks/page";
import StaffTasks from "@/app/(dashboard)/staff/daily-tasks/page";
import StaffDashboard from "@/app/(dashboard)/staff/page";
beforeEach(() => { mocks.calls.length = 0; mocks.role = "admin"; mocks.taskError = null; mocks.materialization = null; mocks.rows.clear(); });
const dateCalls = () => mocks.calls.filter(c => c.table === "admin_daily_tasks" && c.method === "eq" && c.args[0] === "task_date");
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}

function task(id: number, title: string, extra: Record<string, unknown> = {}) {
  return { id, title, status: "pending", task_date: "2026-11-12", ...extra };
}

async function renderAdmin(filters: Record<string, string> = {}, onChunk?: (html: string) => void) {
  const page = await AdminTasks({ searchParams: Promise.resolve(filters) });
  return new Promise<string>((resolve, reject) => {
    let html = "";
    const output = new PassThrough();
    output.setEncoding("utf8").on("data", chunk => { html += chunk; onChunk?.(html); });
    output.on("end", () => resolve(html.replaceAll("<!-- -->", ""))).on("error", reject);
    const stream = renderToPipeableStream(<html><body>{page}</body></html>, {
      onShellReady: () => stream.pipe(output),
      onError: reject,
    });
  });
}

describe("Daily Task history visibility", () => {
  it.each([["admin", "Admin Task"], ["operation", "Operation Task"], ["housekeeping", "Housekeeping Task"]])("keeps all dates visible by default for %s", async (category, heading) => {
    mocks.rows.set("admin_daily_tasks", [task(1, "Open task from an earlier date")]);
    const html = await renderAdmin({ category });
    expect(html).toContain(`<h2>${heading}</h2>`);
    expect(html).toContain("Open task from an earlier date");
    expect(html).toContain(`category=${category}&amp;status=completed`);
    expect(dateCalls()).toHaveLength(0);
    expect(mocks.calls).toContainEqual({ table: "admin_daily_tasks", method: "eq", args: ["task_category", category] });
    expect(mocks.calls).toContainEqual({ table: "recurring_daily_tasks", method: "eq", args: ["task_category", category] });
    expect(mocks.calls.some(({ table }) => ["maintenance_jobs", "appointments", "daily_task_photos", "daily_task_activity"].includes(table))).toBe(false);
    const taskFields = mocks.calls.find((call) => call.table === "admin_daily_tasks" && call.method === "select")?.args[0];
    expect(taskFields).toEqual(expect.stringContaining("photos:daily_task_photos(id)"));
    expect(taskFields).not.toEqual(expect.stringContaining("daily_task_activity"));
    expect(mocks.calls).toContainEqual({ table: "admin_daily_tasks", method: "limit", args: [1, { referencedTable: "photos" }] });
  });
  it("starts independent overview queries while waiting for recurring tasks before reading the task list", async () => {
    const materialization = pending<{ error: null }>();
    mocks.materialization = materialization.promise;
    let emitted = "";
    const page = renderAdmin({ date: "2026-11-12" }, html => { emitted = html; });
    const executed = () => mocks.calls.filter((call) => call.method === "execute").map((call) => call.table);
    try {
      await vi.waitFor(() => expect(executed()).toEqual(expect.arrayContaining(["maintenance_jobs", "appointments", "profiles", "recurring_daily_tasks"])));
      expect(executed()).not.toContain("admin_daily_tasks");
      await vi.waitFor(() => expect(emitted).toContain("<h2>Daily Tasks</h2>"));
      expect(mocks.calls).toContainEqual({ table: "maintenance_jobs", method: "or", args: ["scheduled_for.is.null,scheduled_for.eq.2026-11-12"] });
    } finally {
      mocks.rows.set("admin_daily_tasks", [task(1, "Newly generated recurring task")]);
      materialization.resolve({ error: null });
    }
    const html = await page;
    expect(html).toContain("Newly generated recurring task");
    expect(html).toContain("Add Task");
    expect(html).toContain("admin_task_delete");
    expect(executed()).toContain("admin_daily_tasks");
  });
  it("honors an explicit historical date", async () => {
    await renderAdmin({ category: "admin", date: "2026-10-08" });
    expect(mocks.calls[0]).toEqual({ table: "rpc", method: "materialize_recurring_tasks", args: [{ p_date: "2026-10-08" }] });
    expect(dateCalls()[0].args).toEqual(["task_date", "2026-10-08"]);
  });
  it("reports query errors instead of saying there are no tasks", async () => {
    mocks.taskError = { message: "permission denied" };
    const html = await renderAdmin({ category: "admin" });
    expect(html).toContain("Unable to load task records");
    expect(html).toContain("permission denied");
    expect(html).not.toContain("No admin task in the records");
  });
  it("shows an empty list only after a successful lookup", async () => {
    expect(await renderAdmin({ category: "admin" })).toContain("No admin task in the records.");
    mocks.materialization = Promise.resolve({ error: { message: "Recurring task generation failed" } });
    const html = await renderAdmin({ category: "admin" });
    expect(html).toContain("Recurring task generation failed");
    expect(html).not.toContain("No admin task in the records.");
  });

  it("streams task cards while employees, recurring schedules, jobs and appointments are pending", async () => {
    const employees = pending<unknown[]>();
    const recurrences = pending<unknown[]>();
    const jobs = pending<unknown[]>();
    const appointments = pending<unknown[]>();
    mocks.rows.set("profiles", employees.promise);
    mocks.rows.set("recurring_daily_tasks", recurrences.promise);
    mocks.rows.set("maintenance_jobs", jobs.promise);
    mocks.rows.set("appointments", appointments.promise);
    mocks.rows.set("admin_daily_tasks", [task(1, "Repair lobby door")]);
    let emitted = "";
    const staffId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const page = renderAdmin({ assignedTo: staffId }, html => { emitted = html; });
    try {
      await vi.waitFor(() => expect(emitted).toContain("Repair lobby door"));
      expect(emitted).toContain(`<input type="hidden" name="assignedTo" value="${staffId}"`);
      expect(emitted).toContain("Add Task");
      expect(emitted).toContain('name="title"');
      expect(emitted).toContain("Loading employees");
      expect(emitted).not.toContain("Test employee");
      expect(emitted).not.toContain("No recurring tasks.");
      expect(emitted).not.toContain("All active jobs have a schedule.");
      expect(emitted).not.toContain("No appointments scheduled for this date.");
    } finally {
      employees.resolve([{ id: staffId, role: "cleaner", full_name: "Test employee" }]);
      recurrences.resolve([{ id: 1, title: "Weekly inspection", frequency: "weekly", day_number: 2 }]);
      jobs.resolve([{ id: 1, job_no: "JOB-91", status: "assigned", scheduled_for: null }]);
      appointments.resolve([{ id: 1, appointment_time: "10:00", status: "scheduled", remarks: "Check the entrance" }]);
    }
    const html = await page;
    expect(html).toContain(`<select name="assignedTo"><option value="">All staff</option><option value="${staffId}" selected="">Test employee</option>`);
    for (const text of ["Test employee", "Weekly inspection", "JOB-91", "Check the entrance"]) expect(html).toContain(text);
  });

  it("gives management viewers read-only access to tasks, recurring schedules and jobs", async () => {
    mocks.role = "management_viewer";
    mocks.rows.set("admin_daily_tasks", [task(1, "Viewer task")]);
    mocks.rows.set("recurring_daily_tasks", [{ id: 2, title: "Inspection schedule", frequency: "weekly", day_number: 4 }]);
    mocks.rows.set("maintenance_jobs", [{ id: 3, job_no: "JOB-38", status: "assigned", scheduled_for: null }]);
    const html = await renderAdmin();
    for (const text of ["Viewer task", "Inspection schedule", "JOB-38", "Timeline"]) expect(html).toContain(text);
    expect(mocks.calls.some(call => call.table === "rpc")).toBe(false);
    expect(html).not.toContain("/admin/daily-tasks/action");
    expect(html).not.toContain("Add Task");
  });

  it("filters the default list by Malaysia completion day and keeps earlier completions accessible", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-12T16:20:00Z"));
      mocks.rows.set("admin_daily_tasks", [
        task(1, "Older open task"),
        task(2, "Just completed", { status: "completed", completed_at: "2026-11-12T16:10:00Z" }),
      ]);
      const html = await renderAdmin({ category: "housekeeping" });
      expect(html).toContain("Older open task");
      expect(html).toContain("Just completed");
      const dayFilter = mocks.calls.find(call => call.table === "admin_daily_tasks" && call.method === "or");
      const bounds = String(dayFilter?.args[0]).match(/^status\.neq\.completed,and\(completed_at\.gte\.([^,]+),completed_at\.lt\.([^)]+)\)$/);
      expect(bounds).not.toBeNull();
      expect(new Date(bounds![1]).toISOString()).toBe("2026-11-12T16:00:00.000Z");
      expect(new Date(bounds![2]).toISOString()).toBe("2026-11-13T16:00:00.000Z");

      mocks.calls.length = 0;
      mocks.rows.set("admin_daily_tasks", [task(3, "Archived completion", { status: "completed", completed_at: "2026-08-01T07:00:00Z" })]);
      const completed = await renderAdmin({ category: "housekeeping", status: "completed" });
      expect(completed).toContain("Archived completion");
      expect(mocks.calls).toContainEqual({ table: "admin_daily_tasks", method: "in", args: ["status", ["completed"]] });
      expect(mocks.calls.find(call => call.table === "admin_daily_tasks" && call.method === "or")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders only the first 50 matches and preserves filters when paging", async () => {
    mocks.role = "management_viewer";
    mocks.rows.set("admin_daily_tasks", Array.from({ length: 51 }, (_, index) => task(index + 1, `Inspection number ${index + 1}`)));
    const filters = { category: "operation", date: "2026-11-12", q: "Inspection", status: "pending", sort: "work_date:asc" };
    const first = await renderAdmin(filters);
    expect(first).toContain("<h3>Inspection number 50</h3>");
    expect(first).not.toContain("Inspection number 51");
    expect(mocks.calls).toContainEqual({ table: "admin_daily_tasks", method: "range", args: [0, 50] });
    expect(mocks.calls).toContainEqual({ table: "admin_daily_tasks", method: "order", args: ["id", expect.any(Object)] });
    const links = Array.from(first.matchAll(/href="([^"]+)"/g), match => new URL(match[1].replaceAll("&amp;", "&"), "https://test.example"));
    const next = links.find(link => link.searchParams.get("page") === "2");
    expect(next).toBeDefined();
    for (const [name, value] of Object.entries(filters)) expect(next!.searchParams.get(name)).toBe(value);

    mocks.rows.set("admin_daily_tasks", [task(51, "Inspection number 51")]);
    const second = await renderAdmin(Object.fromEntries(next!.searchParams));
    expect(mocks.calls).toContainEqual({ table: "admin_daily_tasks", method: "range", args: [50, 100] });
    expect(second).toContain("Inspection number 51");
    const previousHref = second.match(/href="([^"]+)">Previous<\/a>/)?.[1];
    expect(previousHref).toBeDefined();
    const previous = new URL(previousHref!.replaceAll("&amp;", "&"), "https://test.example");
    expect(previous.searchParams.get("page") ?? "1").toBe("1");
    for (const [name, value] of Object.entries(filters)) expect(previous.searchParams.get(name)).toBe(value);
    expect(second).not.toContain("page=3");
  });

  it("keeps staff history restricted to the assignee without a default date filter", async () => {
    mocks.role = "cleaner";
    renderToStaticMarkup(await StaffTasks({ searchParams: Promise.resolve({}) }));
    expect(dateCalls()).toHaveLength(0);
    expect(mocks.calls).toContainEqual({ table: "admin_daily_tasks", method: "eq", args: ["assigned_to", "staff-id"] });
  });
  it("combines admin search, date range, staff and status", async () => {
    const staff = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    await renderAdmin({ category: "operation", q: "pump", from: "2026-10-01", to: "2026-10-09", assignedTo: staff, status: "accepted", sort: "work_date:asc" });
    expect(mocks.calls).toContainEqual({ table: "admin_daily_tasks", method: "order", args: ["task_date", { ascending: true }] });
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
