// @vitest-environment node

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";

const { getSessionProfile, createClient } = vi.hoisted(() => ({ getSessionProfile: vi.fn(), createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessionProfile }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

beforeEach(() => vi.resetAllMocks());

it.each([null, { role: "cleaner" }, { role: "gym_patrol" }, { role: "management_viewer" }])(
  "requires the maintenance staff role (%j)", async profile => {
    getSessionProfile.mockResolvedValue(profile);
    const response = await GET();
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(createClient).not.toHaveBeenCalled();
  }
);

it("reads the active stock code, name, unit and balance using the staff session", async () => {
  const item = { id: "tap-id", item_code: "B-0123", description: "Water tap", balance_qty: 4, unit: "pcs" };
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json([item]));
  createClient.mockResolvedValue(createSupabaseClient("https://inventory.example", "test-key", {
    auth: { autoRefreshToken: false, persistSession: false }, global: { fetch },
  }));
  getSessionProfile.mockResolvedValue({ role: "maintenance_staff" });

  const response = await GET();
  expect(await response.json()).toEqual({ items: [item] });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const url = new URL(String(fetch.mock.calls[0][0]));
  expect(url.pathname).toBe("/rest/v1/inventory_items");
  expect(url.searchParams.get("select")).toBe("id,item_code,description,balance_qty,unit");
  expect(url.searchParams.get("is_active")).toBe("eq.true");
  expect(url.searchParams.get("order")).toBe("description.asc");
});
