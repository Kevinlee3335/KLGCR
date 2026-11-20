// @vitest-environment node
import { expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/inventory-google-sync", () => ({ pushInventoryItemToGoogle: vi.fn() }));
vi.mock("@/lib/app-notifications", () => ({ notifyMaterialRequestRecipients: vi.fn() }));

it.each([
  ["https://klgcr.example/admin/material-requests?status=pending&page=2", "pending", "2"],
  ["https://klgcr.example/admin/material-requests?status=approved", "approved", null],
  ["https://klgcr.example/admin/material-requests?status=invalid&page=-1", null, null],
  ["https://other.example/admin/material-requests?status=pending&page=2", null, null],
  ["invalid-url", null, null],
])("keeps only a valid list filter on action redirects (%s)", async (referer, status, page) => {
  const response = await POST(new Request("https://klgcr.example/admin/material-requests/action", {
    method: "POST", headers: { referer: referer! }, body: new FormData(),
  }));
  expect(response.status).toBe(303);
  const location = new URL(response.headers.get("location")!);
  expect(location.origin).toBe("https://klgcr.example");
  expect(location.pathname).toBe("/admin/material-requests");
  expect(location.searchParams.get("status")).toBe(status);
  expect(location.searchParams.get("page")).toBe(page);
  expect(location.searchParams.get("error")).toBe("Request is required.");
});
