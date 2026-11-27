// @vitest-environment node
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/types";
import { OfficeUsageSection } from "./office-usage-section";

const from = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from }) }));
vi.mock("./office-usage-form", () => ({ OfficeUsageForm: ({ items }: { items: { item_code: string }[] }) =>
  <select>{items.map(item => <option key={item.item_code}>{item.item_code}</option>)}</select> }));

function query(result: unknown) {
  const response = Promise.resolve(result);
  return {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue(result), then: response.then.bind(response),
  };
}
const profile: Profile = { id: "viewer", username: "viewer", full_name: "Viewer", role: "management_viewer", is_active: true };

function renderSection(element: React.ReactElement) {
  return new Promise<string>((resolve, reject) => {
    let html = "";
    const out = new PassThrough();
    out.setEncoding("utf8").on("data", text => { html += text; }).on("end", () => resolve(html)).on("error", reject);
    const stream = renderToPipeableStream(element, { onAllReady: () => stream.pipe(out), onError: reject });
  });
}

beforeEach(() => { from.mockReset(); });

it("allows history-only access without reading stock and preserves the warehouse and search on paging", async () => {
  const history = query({ data: [], count: 58, error: null });
  from.mockReturnValue(history);
  const html = await renderSection(<OfficeUsageSection profile={profile} page="2" search="box (A)" base="/admin/inventory?store=office" />);
  expect(from.mock.calls).toEqual([["office_inventory_usage"]]);
  expect(history.range).toHaveBeenCalledWith(25, 49);
  expect(history.or).toHaveBeenCalledWith('item_code.ilike."%box (A)%",description.ilike."%box (A)%",taken_by_name.ilike."%box (A)%"');
  expect(html).not.toContain("Take Office Supplies");
  expect(html).toContain("All recorded withdrawals.");
  expect(html.replaceAll("<!-- -->", "")).toContain("Page 2 of 3");
  expect(html).toContain("store=office&amp;usagePage=3&amp;usageQ=box+%28A%29#office-usage-history");
});

it("reads only active office stock for the standalone employee form and isolates history errors", async () => {
  const stock = query({ data: [{ item_code: "OFF-TEST" }], error: null });
  from.mockImplementation(table => table === "inventory_items" ? stock : query({ data: null, error: { message: "Unavailable" } }));
  const html = await renderSection(<OfficeUsageSection profile={{ ...profile, role: "cleaner" }} />);
  expect(stock.eq.mock.calls).toEqual([["inventory_group", "office"], ["is_active", true]]);
  expect(html).toContain("OFF-TEST");
  expect(html).toContain("Your recorded withdrawals.");
  expect(html).toContain("Unable to load usage history");
  expect(html).not.toContain("No office supplies have been recorded yet.");
});
