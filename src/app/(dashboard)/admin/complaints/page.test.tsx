// @vitest-environment node

import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { createClient as createDatabase } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import ComplaintsPage from "./page";

const { requireRole, createClient } = vi.hoisted(() => ({ requireRole: vi.fn(), createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children, title }: { children: React.ReactNode; title: string }) => <main><h1>{title}</h1>{children}</main> }));
vi.mock("@/components/complaint-summary", () => ({ ComplaintSummary: () => <p>Report summary ready</p> }));

const example = {
  id: "fixture-id", complaint_no: "CMP-FIXTURE", source: "manual", room_no: "421",
  category: "Fixture plumbing", description: "Fixture description", priority: "normal", status: "new",
  submitted_at: "2026-11-27T01:01:00Z", assignee: null, block: { code: "A" },
};

function database(fetch: typeof globalThis.fetch) {
  return createDatabase("https://complaints.example", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch },
  });
}

async function streamPage(params: Record<string, string> = {}) {
  const content = await ComplaintsPage({ searchParams: Promise.resolve(params) });
  const output = new PassThrough();
  let html = "";
  output.setEncoding("utf8").on("data", chunk => { html += chunk; });
  const errors: unknown[] = [];
  const stream = renderToPipeableStream(<html><body>{content}</body></html>, {
    onShellReady: () => stream.pipe(output),
    onError: error => { errors.push(error); },
  });
  return { html: () => html, errors, close() { stream.abort(); output.destroy(); } };
}

it("shows the heading first and streams clickable complaints while counts, filters and blocks are still pending", async () => {
  requireRole.mockResolvedValue({ role: "admin" });
  const pending = new Map<string, (rows?: unknown[]) => void>();
  let rowQuery: URL | undefined;
  createClient.mockResolvedValue(database((input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop()!;
    const columns = url.searchParams.get("select");
    const isTotal = init?.method === "HEAD";
    const key = isTotal ? url.search : table === "complaints" && columns === "category" ? "categories" : table;
    if (key === "complaints") rowQuery = url;
    return new Promise<Response>(resolve => pending.set(key, (rows = []) => resolve(isTotal
      ? new Response(null, { headers: { "content-range": "0-0/9" } }) : Response.json(rows))));
  }));
  const page = await streamPage();
  try {
    await vi.waitFor(() => {
      expect(page.html()).toContain("Add complaint");
      expect(page.html()).toContain("Loading complaints…");
      expect(page.html()).toContain("Search complaints");
      expect(page.html()).toContain("Loading blocks…");
      expect(rowQuery).toBeDefined();
    });
    expect(requireRole).toHaveBeenCalledWith(["admin", "management_viewer"]);
    expect(rowQuery!.searchParams.get("select")).not.toContain("complainant_contact");
    expect(rowQuery!.searchParams.get("order")).toBe("submitted_at.desc,id.asc");
    expect(rowQuery!.searchParams.get("limit")).toBe("51");
    pending.get("complaints")!([example]);
    await vi.waitFor(() => {
      expect(page.html()).toContain("CMP-FIXTURE");
      expect(page.html()).toContain("/admin/complaints/fixture-id");
      expect(pending.has("categories")).toBe(true);
      expect(pending.has("profiles")).toBe(true);
    });
    expect(page.html()).not.toContain("Report summary ready");
    for (const [key, resolve] of pending) {
      if (key === "blocks") resolve([{ id: "blk-a", code: "A" }]);
      else if (key === "categories") resolve([{ category: "Filter fixture" }]);
      else if (key === "profiles") resolve([{ id: "staff1", full_name: "Filter staff" }]);
      else if (key !== "complaints") resolve();
    }
    await vi.waitFor(() => {
      expect(page.html()).toContain("Filter fixture");
      expect(page.html()).toContain("Filter staff");
      expect(page.html()).toContain("Report summary ready");
      expect(page.html()).toContain("Assigned today");
    });
    expect(page.errors).toEqual([]);
  } finally { page.close(); }
});

it.each([["a421", "blk-a"], ["b421", "00000000-0000-0000-0000-000000000000"]])(
  "retains the resolved block and paging for deleted-room searches matching %s", async (room, expectedBlock) => {
    requireRole.mockResolvedValue({ role: "management_viewer" });
    const requests: URL[] = [];
    createClient.mockResolvedValue(database(async (input, init) => {
      const url = new URL(String(input));
      requests.push(url);
      const table = url.pathname.split("/").pop();
      if (init?.method === "HEAD") return new Response(null, { headers: { "content-range": "*/0" } });
      if (table === "blocks") return Response.json([{ id: "blk-a", code: "A" }]);
      return Response.json([]);
    }));
    const page = await streamPage({ status: "deleted", search: room, page: "2", priority: "urgent" });
    try {
      await vi.waitFor(() => expect(page.html()).toContain("No deleted complaints found"));
      const q = requests.find(url => url.pathname.endsWith("/deleted_complaints"))!.searchParams;
      expect(q.get("block_id")).toBe("eq." + expectedBlock);
      expect(q.get("priority")).toBe("eq.urgent");
      expect(q.get("or")).toContain("room_no.ilike");
      expect(q.get("offset")).toBe("50");
      expect(q.get("limit")).toBe("51");
      expect(page.html()).toContain("Previous");
      expect(page.html()).not.toContain("Add complaint");
      expect(requests.filter(url => url.pathname.endsWith("/blocks"))).toHaveLength(1);
      expect(requests.find(url => url.pathname.endsWith("/profiles"))).toBeUndefined();
      expect(page.errors).toEqual([]);
    } finally { page.close(); }
  }
);

it("keeps search, multi-status, sorting and paging on the active request", async () => {
  requireRole.mockResolvedValue({ role: "management_viewer" });
  let rowQuery: URL | undefined;
  createClient.mockResolvedValue(database(async (input, init) => {
    const url = new URL(String(input));
    if (init?.method === "HEAD") return new Response(null, { headers: { "content-range": "*/0" } });
    if (url.searchParams.get("select")?.startsWith("id,complaint_no,")) rowQuery = url;
    return Response.json([]);
  }));
  const page = await streamPage({
    search: "tap", status_kiv: "kiv", status_new: "new", sort: "status:asc", page: "3",
    block: "external", assigned: "unassigned", priority: "urgent", category: "Plumbing",
    source: "manual", needAppointment: "1", date: "2026-11-27",
  });
  try {
    await vi.waitFor(() => expect(page.html()).toContain("No complaints found"));
    const q = rowQuery!.searchParams;
    expect(Object.fromEntries(q)).toMatchObject({
      status: "in.(new,kiv)", order: "status.asc,id.asc", block_id: "is.null", assigned_to: "is.null",
      offset: "100", limit: "51", priority: "eq.urgent", category: "eq.Plumbing", source: "eq.manual",
      need_appointment: "eq.true",
    });
    expect(q.getAll("submitted_at")).toEqual(["gte.2026-11-27T00:00:00", "lt.2026-11-27T23:59:59.999"]);
    expect(q.get("or")).toContain("complainant_name.ilike.%tap%");
    expect(page.html()).toContain("status_kiv=kiv");
    expect(page.html()).not.toContain("Add complaint");
    expect(page.errors).toEqual([]);
  } finally { page.close(); }
});
