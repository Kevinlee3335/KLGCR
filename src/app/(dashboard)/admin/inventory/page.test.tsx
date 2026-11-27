import type { ReactNode } from "react";
import { PassThrough } from "node:stream";
import { text } from "node:stream/consumers";
import { prerenderToNodeStream } from "react-dom/static.node";
import { renderToPipeableStream } from "react-dom/server";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import InventoryPage from "./page";

const mocks = vi.hoisted(() => ({ from: vi.fn(), requireRole: vi.fn(), readBatch: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/components/office-usage-form", () => ({
  OfficeUsageForm: ({ items }: { items: { description: string }[] }) => <p>{items.map((item) => item.description).join(", ")}</p>,
}));

const items = [
  { id: "1", item_code: "OFF-0001", description: "Paper", category: "Office Inventory", balance_qty: 0, reorder_level: 2, unit: "packs", is_active: true, stock_group: null, procurement_mode: "maintain_stock", movement_category: "fast", source_details: null, cost: 5 },
  { id: "2", item_code: "OFF-0002", description: "Old folders", category: "Office Inventory", balance_qty: 0, reorder_level: 1, unit: "pcs", is_active: false, stock_group: null, procurement_mode: "maintain_stock", movement_category: "slow", source_details: null, cost: null },
  { id: "3", item_code: "OFF-0003", description: "Envelopes", category: "Office Inventory", balance_qty: 1, reorder_level: 2, unit: "pcs", is_active: true, stock_group: null, procurement_mode: "maintain_stock", movement_category: "slow", source_details: null, cost: 1 },
];
const stores = [
  { store: "building", title: "Building Material", prefix: "BLD", category: "Building" },
  { store: "office", title: "Office Inventory", prefix: "OFF", category: "Office Inventory" },
  { store: "cleaner", title: "Cleaner Supplies", prefix: "CLN", category: "Cleaner Supplies" },
];
const stock = stores.flatMap(({ store, prefix, category }) => items.map(item => ({
  ...item, inventory_group: store, category, item_code: item.item_code.replace("OFF", prefix), id: `${store}-${item.id}`,
})));
const inventoryReads: { columns: string; store: string; search: string; from: number; to: number }[] = [];
const historyReads: { table: string; store: string; limit: number }[] = [];
const gates = new Map<string, Promise<void>>();
let withHistory = false;

type Params = Awaited<Parameters<typeof InventoryPage>[0]["searchParams"]>;
async function renderHTML(params: Params, onChunk: (html: string) => void) {
  const page = await InventoryPage({ searchParams: Promise.resolve(params) });
  return new Promise<string>((resolve, reject) => {
    const output = new PassThrough();
    let html = "";
    output.setEncoding("utf8").on("data", chunk => { html += chunk; onChunk(html); });
    output.on("end", () => resolve(html)).on("error", reject);
    const stream = renderToPipeableStream(<html><body>{page}</body></html>, {
      onShellReady: () => stream.pipe(output), onError: reject,
    });
  });
}

async function renderPage(params: Params) {
  const page = await InventoryPage({ searchParams: Promise.resolve(params) });
  // Keep completed panels inline so DOM queries see the same subtree as a browser after streaming.
  const { prelude } = await prerenderToNodeStream(page, { progressiveChunkSize: Number.MAX_SAFE_INTEGER });
  document.body.innerHTML = await text(prelude);
}

function pauseLookup(name: string) {
  const gate = Promise.withResolvers<void>();
  gates.set(name, gate.promise);
  return gate.resolve;
}

afterEach(() => { document.body.replaceChildren(); });

beforeEach(() => {
  vi.clearAllMocks();
  inventoryReads.length = 0;
  historyReads.length = 0;
  gates.clear();
  withHistory = false;
  mocks.readBatch.mockResolvedValue({ data: { id: "batch-1", batch_no: "COB-2026-0001", state: "active" }, error: null });
  mocks.requireRole.mockResolvedValue({ id: "admin", role: "admin", full_name: "Admin" });
  mocks.from.mockImplementation((table: string) => {
    const request = { columns: "", store: "", search: "", category: "", from: 0, to: 0 };
    const query = {
      select(columns: string) { request.columns = columns; return query; },
      eq(column: string, value: string) {
        if (column === "inventory_group" || column === "item.inventory_group") request.store = value;
        if (column === "category") request.category = value;
        return query;
      },
      or(search: string) { request.search = search; return query; },
      order() { return query; },
      in() { return query; },
      async maybeSingle() { return table === "checkout_batches" ? mocks.readBatch() : { data: null, error: null }; },
      async range(from: number, to: number) {
        if (table !== "inventory_items") {
          await gates.get(table);
          return { data: [], count: 0, error: null };
        }
        inventoryReads.push({ ...request, from, to });
        await gates.get(request.columns.includes("source_details") ? "details" : "catalog");
        const rows = stock.filter(item =>
          (!request.store || item.inventory_group === request.store) &&
          (!request.category || item.category === request.category) &&
          (!request.search || request.search.includes(item.description))
        );
        return { data: rows.slice(from, to + 1), error: null };
      },
      async limit(limit: number) {
        historyReads.push({ table, store: request.store, limit });
        await gates.get(table);
        if (!withHistory) return { data: [], error: null };
        const data = stock.filter(item => item.id.endsWith("-1") && (!request.store || item.inventory_group === request.store))
          .map(item => ({
            id: item.id, item, qty: 1, balance_before: 5, balance_after: 4, issued_at: "2026-11-27T01:00:00Z",
            adjusted_at: "2026-11-27T02:00:00Z", adjustment_type: "correction_remove",
            job: { job_no: `Job-${item.inventory_group}` }, note: `Correction-${item.inventory_group}`,
          }));
        return { data, error: null };
      },
    };
    return query;
  });
});

it("loads the office catalog once for stock summaries and the withdrawal form without loading stock detail", async () => {
  await renderPage({ store: "office" });

  expect(await screen.findByText("Paper, Envelopes")).toBeInTheDocument();
  expect(await screen.findByText("No material issues yet.")).toBeInTheDocument();
  expect(inventoryReads).toHaveLength(1);
  expect(inventoryReads[0].store).toBe("office");
  expect(inventoryReads[0].columns).not.toContain("source_details");
  const summaries = within(document.querySelector(".inventory-kpis")!);
  expect(summaries.getByText("Total Items").parentElement?.querySelector("strong")).toHaveTextContent("3");
  expect(summaries.getByText("Out of Stock").parentElement?.querySelector("strong")).toHaveTextContent("1");
  expect(summaries.getByText("Near Reorder").parentElement?.querySelector("strong")).toHaveTextContent("1");
});

it("reuses the full stock rows for the catalog when opening View All", async () => {
  await renderPage({ store: "office", view: "all" });

  expect(await screen.findByText("Paper, Envelopes")).toBeInTheDocument();
  expect(inventoryReads).toHaveLength(1);
  expect(inventoryReads[0].columns).toContain("source_details");
  const stock = document.getElementById("inventory-stock-list")!;
  expect(within(stock).getByText("Old folders")).toBeInTheDocument();
  expect(within(stock).getByRole("link", { name: "Hide List" })).toHaveAttribute("href", "/admin/inventory?store=office#inventory-stock-list");
});

it("keeps the full purchase and withdrawal catalog when the stock list is filtered", async () => {
  await renderPage({ store: "office", q: "Paper" });

  expect(await screen.findByText("Paper, Envelopes")).toBeInTheDocument();
  expect(inventoryReads).toHaveLength(2);
  const detail = inventoryReads.find((query) => query.columns.includes("source_details"));
  expect(detail).toMatchObject({ store: "office", search: 'item_code.ilike."%Paper%",description.ilike."%Paper%"' });
  expect(screen.getByText("Total Items").parentElement).toHaveTextContent("1");
  expect(within(document.getElementById("inventory-stock-list")!).queryByText("Old folders")).toBeNull();
});

it("starts stock and movement reads while the admin stock-out batch is still loading", async () => {
  const batch = Promise.withResolvers<{ data: { id: string; batch_no: string; state: string }; error: null }>();
  mocks.readBatch.mockReturnValueOnce(batch.promise);
  const rendering = renderPage({ store: "building" });
  try {
    await waitFor(() => {
      expect(mocks.readBatch).toHaveBeenCalledOnce();
      expect(inventoryReads).toHaveLength(1);
      expect(mocks.from).toHaveBeenCalledWith("inventory_issue_history");
      expect(mocks.from).toHaveBeenCalledWith("inventory_adjustment_history");
    });
  } finally {
    batch.resolve({ data: { id: "current-batch", batch_no: "COB-2026-0002", state: "active" }, error: null });
    await rendering;
  }
  expect(screen.getByRole("option", { name: "Check-out rooms · COB-2026-0002" })).toHaveValue("current-batch");
});

it.each(stores)("shows a read-only inventory and history in $store without a stock-out batch read", async ({ store }) => {
  mocks.requireRole.mockResolvedValue({ id: "viewer", role: "management_viewer", full_name: "Viewer" });
  await renderPage({ store, view: "all" });

  expect(mocks.from).not.toHaveBeenCalledWith("checkout_batches");
  expect(screen.getByText("Total Items").parentElement).toHaveTextContent("3");
  expect(screen.getByText("No material issues yet.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Record Stock Out" })).toBeNull();
  expect(screen.queryByText("Edit / Adjust")).toBeNull();
  expect(screen.queryByText("Add Inventory Item")).toBeNull();
  expect(screen.queryByText("Take Office Supplies")).toBeNull();
  expect(screen.queryByText("Add Selected to PO")).toBeNull();
  expect(mocks.requireRole).toHaveBeenCalledWith(["admin", "management_viewer"]);
});

it.each(stores)("keeps stock, order lists and movement history scoped to $store when descriptions match", async ({ store, title, prefix, category }) => {
  withHistory = true;
  await renderPage({ store, q: "Paper", category });
  expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  const list = within(document.getElementById("inventory-stock-list")!);
  expect(list.getByLabelText("Search Item Code or Description")).toHaveValue("Paper");
  expect(list.getByLabelText("Inventory Group")).toHaveValue(category);
  expect(list.getByText(`${prefix}-0001`)).toBeInTheDocument();
  expect(list.queryByText("Envelopes")).toBeNull();
  expect(within(document.getElementById("items-to-order")!).getByText("Envelopes")).toBeInTheDocument();
  expect(screen.getByText("Total Items").parentElement).toHaveTextContent("1");
  expect(screen.getByText("Need to Order").parentElement).toHaveTextContent("2");
  expect(screen.getByText(`Job-${store}`)).toBeInTheDocument();
  expect(screen.getByText(`Correction-${store}`)).toBeInTheDocument();
  expect(historyReads).toEqual(expect.arrayContaining([
    { table: "inventory_issue_history", store, limit: 30 },
    { table: "inventory_adjustment_history", store, limit: 30 },
  ]));
  for (const other of stores.filter(other => other.store !== store)) {
    expect(document.body.textContent).not.toContain(`${other.prefix}-0001`);
    expect(document.body.textContent).not.toContain(`Job-${other.store}`);
    expect(document.body.textContent).not.toContain(`Correction-${other.store}`);
  }
});

it("shows the navigation, search and stock-out fields while the catalog loads; filtered stock can arrive first", async () => {
  const releaseCatalog = pauseLookup("catalog");
  const releaseDetails = pauseLookup("details");
  let received = "";
  const rendering = renderHTML({ store: "cleaner", q: "Paper" }, html => { received = html; });
  try {
    await vi.waitFor(() => {
      for (const text of ["Cleaner Supplies", 'href="/admin/inventory/purchase-orders"', 'name="q"', "Hide List", 'name="takenBy"', 'name="qty"']) {
        expect(received).toContain(text);
      }
    });
    expect(received).not.toContain("CLN-0001");
    expect(inventoryReads).toHaveLength(2);
    releaseDetails();
    await vi.waitFor(() => expect(received).toContain("CLN-0001"));
    expect(received).not.toContain("Envelopes");
  } finally {
    releaseDetails();
    releaseCatalog();
  }
  const completed = await rendering;
  expect(completed).toContain("Envelopes");
  expect(completed).toContain("Paper");
});

it("lets admins use the office catalog and historical issues while adjustments, office usage and check-out batch are pending", async () => {
  withHistory = true;
  const releaseAdjustments = pauseLookup("inventory_adjustment_history");
  const releaseOfficeUsage = pauseLookup("office_inventory_usage");
  const batch = Promise.withResolvers<{ data: { id: string; batch_no: string; state: string }; error: null }>();
  mocks.readBatch.mockReturnValueOnce(batch.promise);
  let received = "";
  const rendering = renderHTML({ store: "office" }, html => { received = html; });
  try {
    await vi.waitFor(() => {
      expect(received).toContain("Paper, Envelopes");
      expect(received).toContain("Job-office");
      expect(received).toContain("Add Selected to PO");
      expect(received).toContain("OFF-0001");
    });
    expect(received).not.toContain("Correction-office");
    expect(received).not.toContain("COB-2026-0042");
    expect(received).not.toContain("No office supplies have been recorded yet.");
  } finally {
    releaseAdjustments();
    releaseOfficeUsage();
    batch.resolve({ data: { id: "batch-42", batch_no: "COB-2026-0042", state: "active" }, error: null });
  }
  const html = await rendering;
  expect(html).toContain("Correction-office");
  expect(html).toContain("COB-2026-0042");
  expect(html).toContain("No office supplies have been recorded yet.");
});
