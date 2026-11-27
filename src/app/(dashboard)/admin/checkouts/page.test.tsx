// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import Page from "./page";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

it.each(["admin", "management_viewer"])("opens the authorized %s room actions while batch and reporting reads are pending", async role => {
  mocks.requireRole.mockResolvedValue({ role, username: "fixture" });
  mocks.createClient.mockResolvedValue(createSupabaseClient("https://rooms.example", "test-key", {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: () => new Promise<Response>(() => {}) },
  }));

  const content = await Page({ searchParams: Promise.resolve({}) });
  const html = renderToStaticMarkup(content);
  expect(html).toContain("Check-out room readiness");
  expect(html).toContain("Ready for Occupancy Report");
  expect(html).toContain("Loading current check-out batch");
  expect(html.includes("Room Inspection · Block A &amp; B")).toBe(role === "admin");
  expect(html.includes("Room Inspection · Block C &amp; D")).toBe(role === "admin");
});
