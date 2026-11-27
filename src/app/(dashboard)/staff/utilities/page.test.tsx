// @vitest-environment node
import { prerender } from "react-dom/static";
import { beforeEach, expect, it, vi } from "vitest";
import { UTILITY_PHOTO_STAFF_ID } from "@/lib/utility-photo-access";
import Page from "./page";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessionProfile: mocks.profile }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({rpc:mocks.rpc}) }));
vi.mock("@/lib/billing-preview", async original => ({ ...await original<typeof import("@/lib/billing-preview")>(), billingPreviewEnabled: () => true, malaysiaClock: () => ({date:"2026-11-28"}) }));
vi.mock("@/components/app-shell", () => ({AppShell: ({children}: {children: React.ReactNode}) => <main>{children}</main>}));
beforeEach(() => {vi.resetAllMocks();mocks.profile.mockResolvedValue({ id:UTILITY_PHOTO_STAFF_ID, role:"maintenance_staff",is_active:true });});
it.each([["2026-11",true],["2026-10",false]] as const)("reads a photo-free initial meter list and leaves rollover to the existing API for %s",async (period, ready) => {
  mocks.rpc.mockResolvedValue({data:{period,revision:3,utilityAccounts:[{id:"a",name:"Fixture meter account", meters:[]}]}, error:null});
  const {prelude} = await prerender(await Page());
  const html = await new Response(prelude).text();
  expect(html.includes("Fixture meter account")).toBe(ready);
  expect(mocks.rpc.mock.calls).toEqual([["get_utility_meter_photos",{p_account_id:null,p_meter_id:null}]]);
});
it("checks staff eligibility before opening a meter read", async () => {
  mocks.profile.mockResolvedValue({id:"other",role:"maintenance_staff",is_active:true});
  await expect(Page()).rejects.toThrow();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
