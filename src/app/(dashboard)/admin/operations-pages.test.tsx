// @vitest-environment node
import { PassThrough } from "node:stream";
import { text } from "node:stream/consumers";
import { prerenderToNodeStream } from "react-dom/static.node";
import { renderToPipeableStream } from "react-dom/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import DashboardPage from "./page";
import UsersPage from "./users/page";
import SettingsPage from "./settings/page";
import NotificationsPage from "./notifications/page";
import SuperAdminPage from "./super-admin/page";

const mocks = vi.hoisted(() => ({ db: vi.fn(), role: vi.fn(), superAdmin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.role, requireSuperAdmin: mocks.superAdmin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.db }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/document-review-queue", () => ({ DocumentReviewQueue: () => null }));
vi.mock("@/components/supplier-mail-summary", () => ({ SupplierMailSummary: () => null }));
vi.mock("@/components/monitoring-follow-up", () => ({ MonitoringFollowUp: () => null }));
vi.mock("@/components/checkout-defect-follow-up", () => ({ CheckoutDefectFollowUp: () => null }));
vi.mock("@/lib/flex-inspection-review-store", () => ({ flexReviewer: () => false }));
vi.mock("@/components/user-row-actions", () => ({
  UserRowActions: ({ canResetPassword }: { canResetPassword: boolean }) => <span>{canResetPassword ? "Reset allowed" : "Email required"}</span>,
}));

const requests: URL[] = [];
const results = new Map<string, unknown>();
const gates = new Map<string, Promise<void>>();
function pause(name: string) {
  const gate = Promise.withResolvers<void>();
  gates.set(name, gate.promise);
  return gate.resolve;
}
function queries(table: string) { return requests.filter(url => url.pathname.endsWith("/" + table)); }

beforeEach(() => {
  requests.length = 0;
  results.clear(); gates.clear();
  const profile = { full_name: "Test Viewer", username: "viewer", role: "management_viewer", id: "viewer" };
  mocks.role.mockReset().mockResolvedValue(profile);
  mocks.superAdmin.mockReset().mockResolvedValue(profile);
  mocks.db.mockReset().mockResolvedValue(createSupabaseClient("https://operations.example", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      const table = url.pathname.split("/").pop()!;
      requests.push(url);
      await gates.get(table);
      if (init?.method === "HEAD") return new Response(null, { headers: { "Content-Range": "0-3/4" } });
      const rows = results.get(table);
      return Response.json(typeof rows === "function" ? rows(url) : rows ?? []);
    } },
  }));
});

async function stream(content: Promise<React.ReactNode>, onChunk: (html: string) => void) {
  const page = await content;
  return new Promise<string>((resolve, reject) => {
    let html = "";
    const output = new PassThrough();
    output.setEncoding("utf8").on("data", chunk => { html += chunk; onChunk(html); });
    output.on("end", () => resolve(html)).on("error", reject);
    const result = renderToPipeableStream(<html><body>{page}</body></html>, {
      onShellReady: () => result.pipe(output), onError: reject,
    });
  });
}

it("renders dashboard actions and recent complaints while KPI and job queries are pending", async () => {
  const releaseCounts = pause("admin_dashboard_counts");
  const releaseWorkload = pause("admin_dashboard_workload_counts");
  results.set("admin_dashboard_counts", [{ new_complaints: 12, today_tasks: 2, completed_today: 4 }]);
  results.set("complaints", [{ id: "c1", complaint_no: "CMP-91", status: "new", priority: "normal", submitted_at: "2026-11-20T03:00:00Z" }]);
  let emitted = "";
  const done = stream(DashboardPage(), html => { emitted = html; });
  try {
    await vi.waitFor(() => {
      expect(emitted).toContain("CMP-91");
      expect(emitted).toContain("Operations Command Centre");
      expect(emitted).toContain('href="/admin/material-requests"');
      expect(emitted).toContain('href="/admin/jobs?scope=today-active"');
    });
  } finally { releaseCounts(); releaseWorkload(); }
  expect(await done).toContain("Jobs Overview");
  expect(queries("admin_dashboard_counts")).toHaveLength(1);
  expect(queries("admin_dashboard_workload_counts")).toHaveLength(1);
  const scheduled = queries("maintenance_jobs").find(url => url.searchParams.has("scheduled_for"));
  expect(scheduled?.searchParams.get("select")).toContain("complaint:complaints!inner");
  expect(scheduled?.searchParams.get("complaint.room_access_permission")).toBe("neq.no");
});

it("shows unresolved visits independently of stock counts and checks active replacements on the same request", async () => {
  const release = pause("inventory_items");
  const visit = { id: "v1", job_id: "j1", appointment_date: "2026-11-20", appointment_time: "10:45:00", attended_at: null,
    job: { id: "j1", job_no: "JOB-AVAILABLE", status: "assigned", room_no: "201", block: { code: "B" }, active_appointments: [] } };
  results.set("appointments", [visit, { ...visit, job_id: "j2", job: { ...visit.job, id: "j2", job_no: "JOB-REBOOKED", active_appointments: [{ id: "next" }] } }]);
  let emitted = "";
  const done = stream(NotificationsPage(), html => { emitted = html; });
  try {
    await vi.waitFor(() => expect(emitted).toContain("JOB-AVAILABLE"));
    expect(emitted).toContain('href="/admin/jobs?status=pending_material"');
    expect(emitted).not.toContain("JOB-REBOOKED");
  } finally { release(); }
  await done;
  const reads = queries("appointments");
  expect(reads).toHaveLength(1);
  expect(reads[0].searchParams.get("job.active_appointments.status")).toBe("in.(pending_confirmation,confirmed)");
  expect(reads[0].searchParams.get("job.active_appointments.limit")).toBe("1");
});

it("keeps the super-admin search and job results independent of the audit history", async () => {
  const release = pause("super_admin_audit");
  results.set("maintenance_jobs", [{ id: "a", job_no: "JOB-B601", room_no: "B601", status: "assigned", category: "Plumbing" }]);
  let emitted = "";
  const done = stream(SuperAdminPage({ searchParams: Promise.resolve({ q: "B601" }) }), html => { emitted = html; });
  try {
    await vi.waitFor(() => expect(emitted).toContain("JOB-B601"));
    expect(emitted).toContain("Search jobs, complaints and rooms");
    expect(emitted).not.toContain("No Super Admin overrides recorded");
  } finally { release(); }
  expect(await done).toContain("No Super Admin overrides recorded");
  expect(mocks.superAdmin).toHaveBeenCalledOnce();
  expect(queries("maintenance_jobs")[0].searchParams.get("or")).toContain("room_no.ilike.%B601%");
});

it("makes Add user available before the list and reads only fields used for row actions", async () => {
  const release = pause("profiles");
  results.set("profiles", [{ id: "u1", full_name: "New Colleague", username: "user1", is_active: true, role: "cleaner", email: null }]);
  let emitted = "";
  const done = stream(UsersPage(), html => { emitted = html; });
  try {
    await vi.waitFor(() => expect(emitted).toContain("Create user"));
    expect(emitted).not.toContain("New Colleague");
  } finally { release(); }
  expect(await done).toContain("Email required");
  expect(mocks.role).toHaveBeenCalledWith(["admin"]);
  expect(queries("profiles")[0].searchParams.get("select")).not.toContain("profile_blocks");
});

it("shows the settings heading while retaining the active-maintenance-only filter", async () => {
  const release = pause("profiles");
  results.set("profiles", [{ id: "u2", full_name: "Test Technician", profile_blocks: [{ blocks: { code: "D" } }] }]);
  let emitted = "";
  const done = stream(SettingsPage(), html => { emitted = html; });
  try {
    await vi.waitFor(() => expect(emitted).toContain("Maintenance Assignment Settings"));
    expect(emitted).not.toContain("No active maintenance staff found");
  } finally { release(); }
  expect(await done).toContain("Test Technician");
  expect(mocks.role).toHaveBeenCalledWith(["admin"]);
  expect(queries("profiles")[0].searchParams.get("role")).toBe("eq.maintenance_staff");
  expect(queries("profiles")[0].searchParams.get("is_active")).toBe("eq.true");
});

it("does not start any super-admin query before authorization", async () => {
  mocks.superAdmin.mockRejectedValueOnce(new Error("Access denied"));
  await expect(SuperAdminPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("Access denied");
  expect(mocks.db).not.toHaveBeenCalled();
});

it("counts the full active inventory in notification totals, including items beyond the first response", async () => {
  results.set("inventory_items", (url: URL) => url.searchParams.get("offset") === "1000"
    ? [{ balance_qty: 2, reorder_level: 2 }]
    : Array.from({ length: 1000 }, () => ({ balance_qty: 0, reorder_level: 2 })));
  const { prelude } = await prerenderToNodeStream(await NotificationsPage(), { progressiveChunkSize: Number.MAX_SAFE_INTEGER });
  const html = (await text(prelude)).replace(/<!--[\s\S]*?-->/g, "");
  expect(html).toContain("<span>Out of Stock</span><strong>1000</strong>");
  expect(html).toContain("<span>Near Reorder</span><strong>1</strong>");
  expect(html).toContain("<span>Open alerts</span><strong>1013</strong>");
  expect(queries("inventory_items").map(url => url.searchParams.get("offset"))).toEqual(["0", "1000"]);
});
