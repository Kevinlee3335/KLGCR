// @vitest-environment node

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";

const { getSessionProfile, createClient } = vi.hoisted(() => ({
  getSessionProfile: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSessionProfile }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

function request(term?: string) {
  const url = new URL("https://klgcr.example/api/material-requests/inventory");
  if (term !== undefined) url.searchParams.set("q", term);
  return new NextRequest(url);
}

function mockDatabase(data: unknown, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(data, { status }));
  createClient.mockResolvedValue(createSupabaseClient("https://inventory.example", "test-key", {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch },
  }));
  return fetch;
}

beforeEach(() => {
  vi.resetAllMocks();
  getSessionProfile.mockResolvedValue({ role: "admin" });
});

it.each([null, { role: "management_viewer" }, { role: "maintenance_staff" }])(
  "rejects callers without admin access (%j)",
  async (profile) => {
    getSessionProfile.mockResolvedValue(profile);

    const response = await GET(request("hose"));

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(createClient).not.toHaveBeenCalled();
  },
);

it.each([undefined, " a ", "x".repeat(101), "a\0b"])("rejects invalid terms (%j)", async (term) => {
  const response = await GET(request(term));

  expect(response.status).toBe(400);
  expect(createClient).not.toHaveBeenCalled();
});

it("queries the code and name of active items with a stable order and result limit", async () => {
  const item = {
    id: "sample-item",
    item_code: "BLD-0102",
    description: "Hose connector",
    inventory_group: "building",
    balance_qty: 7,
    unit: "pcs",
    quantity_unverified: false,
  };
  const fetch = mockDatabase([item]);

  const response = await GET(request("  Hose  "));

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ items: [item] });
  expect(fetch).toHaveBeenCalledTimes(1);
  const url = new URL(String(fetch.mock.calls[0][0]));
  expect(url.pathname).toBe("/rest/v1/inventory_items");
  expect(url.searchParams.get("select")).toBe("id,item_code,description,inventory_group,balance_qty,unit,quantity_unverified");
  expect(url.searchParams.get("is_active")).toBe("eq.true");
  expect(url.searchParams.get("or")).toBe('(item_code.imatch."***=Hose",description.imatch."***=Hose")');
  expect(url.searchParams.get("order")).toBe("item_code.asc,id.asc");
  expect(url.searchParams.get("limit")).toBe("20");
});

it("quotes PostgREST filter delimiters and treats wildcard characters as literal", async () => {
  const fetch = mockDatabase([]);
  const term = 'Hose (*), "25%_mm"\\x';

  const response = await GET(request(term));

  expect(await response.json()).toEqual({ items: [] });
  const url = new URL(String(fetch.mock.calls[0][0]));
  const operand = '"***=Hose (*), \\"25%_mm\\"\\\\x"';
  expect(url.searchParams.get("or")).toBe(`(item_code.imatch.${operand},description.imatch.${operand})`);
});

it("keeps database failures distinct from empty search results", async () => {
  mockDatabase({ message: "Internal database failure" }, 500);

  const response = await GET(request("hose"));

  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ error: "Unable to search inventory. Please try again." });
});
