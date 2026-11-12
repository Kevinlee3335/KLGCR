import type { ReactNode } from "react";
import { Writable } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import InventoryPage from "./page";

const mocks = vi.hoisted(() => ({ from: vi.fn(), requireRole: vi.fn() }));
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
const inventoryReads: { columns: string; store: string; search: string; from: number; to: number }[] = [];

async function renderPage(params: { store: string; view?: string; q?: string }) {
  const page = await InventoryPage({ searchParams: Promise.resolve(params) });
  document.body.innerHTML = await new Promise<string>((resolve, reject) => {
    const buffers: Buffer[] = [];
    const output = new Writable({
      write(chunk: Buffer, _encoding, callback) { buffers.push(chunk); callback(); },
    });
    output.on("finish", () => resolve(Buffer.concat(buffers).toString("utf8")));
    output.on("error", reject);
    const stream = renderToPipeableStream(page, { onAllReady: () => stream.pipe(output), onError: reject });
  });
}

afterEach(() => { document.body.replaceChildren(); });

beforeEach(() => {
  inventoryReads.length = 0;
  mocks.requireRole.mockResolvedValue({ id: "admin", role: "admin", full_name: "Admin" });
  mocks.from.mockImplementation((table: string) => {
    const request = { columns: "", store: "", search: "", from: 0, to: 0 };
    const query = {
      select(columns: string) { request.columns = columns; return query; },
      eq(column: string, value: string) { if (column === "inventory_group") request.store = value; return query; },
      or(search: string) { request.search = search; return query; },
      order() { return query; },
      async range(from: number, to: number) {
        if (table !== "inventory_items") return { data: [], count: 0, error: null };
        inventoryReads.push({ ...request, from, to });
        return { data: (request.search ? items.filter((item) => item.description === "Paper") : items).slice(from, to + 1), error: null };
      },
      async limit() { return { data: [], error: null }; },
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
