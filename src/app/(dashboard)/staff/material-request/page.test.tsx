// @vitest-environment node

import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import StaffMaterialRequestPage from "./page";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole: () => Promise.resolve({ id: "staff-id", role: "maintenance_staff" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

it("streams the staff heading and active job form while stock and personal history remain pending", async () => {
  const pending = new Map<string, (rows: unknown[]) => void>();
  const requests = new Map<string, URL>();
  const db = createSupabaseClient("https://materials.example", "test-key", {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: async input => {
      const url = new URL(String(input));
      const table = url.pathname.split("/").pop()!;
      requests.set(table, url);
      return new Promise<Response>(resolve => pending.set(table, rows => resolve(Response.json(rows))));
    } },
  });
  createClient.mockResolvedValue(db);

  const content = await StaffMaterialRequestPage({ searchParams: Promise.resolve({ job: "job-1" }) });
  const output = new PassThrough();
  let html = "";
  output.setEncoding("utf8").on("data", chunk => { html += chunk; });
  const stream = renderToPipeableStream(<html><body>{content}</body></html>, { onShellReady: () => stream.pipe(output) });
  try {
    await vi.waitFor(() => {
      expect(html).toContain("My Recent Requests");
      expect(html).toContain("Loading active jobs");
      expect([...requests.keys()].sort()).toEqual(["checkout_rooms", "inventory_items", "maintenance_jobs", "material_requests"]);
    });
    expect(requests.get("material_requests")?.searchParams.get("requested_by")).toBe("eq.staff-id");

    pending.get("maintenance_jobs")!([{ id: "job-1", job_no: "JOB-01", room_no: "204", block: { code: "A" } }]);
    pending.get("checkout_rooms")!([]);
    await vi.waitFor(() => expect(html).toContain("JOB-01"));
    expect(html).toContain("Search inventory item");
    expect(html).not.toContain("No recent material requests yet.");
    pending.get("material_requests")!([]);
    pending.get("inventory_items")!([]);
    await vi.waitFor(() => expect(html).toContain("No recent material requests yet."));
  } finally {
    stream.abort();
    output.destroy();
  }
});
