import type {ReactNode} from "react";
import {afterEach, expect, it, vi} from "vitest";
import {BILLING_APPROVER_ID} from "@/lib/billing-approval";
import {defaultBillingConfig} from "@/lib/billing-preview";
import {streamPage} from "@/test/stream-page";
import Page from "./page";

const mocks = vi.hoisted(() => ({auth:vi.fn(), settings:vi.fn(), pending:vi.fn()}));
vi.mock("@/lib/auth", () => ({requireRole:mocks.auth}));
vi.mock("@/lib/billing-preview-data", () => ({loadBillingSettings:mocks.settings, loadPendingBillingCount:mocks.pending}));
vi.mock("@/components/app-shell", () => ({AppShell:({children}:{children:ReactNode}) => <>{children}</>}));
afterEach(() => vi.resetAllMocks());

const data = {
  config:{...defaultBillingConfig, tenants:[{id:1,name:"Test tenancy",reg:"",addr:[],lot:"A",rent:550,s:"2026-01-01",e:"2026-12-31",ord:1,dl:""}]},
  photosLoaded:false, revision:4, clock:{date:"2026-11-27",time:"09:00"},
};

it("renders the selected tenancy and billing controls before an approver's pending count returns", async () => {
  const counts = Promise.withResolvers<number>();
  mocks.auth.mockResolvedValue({id:BILLING_APPROVER_ID,role:"admin",full_name:"Approver"});
  mocks.settings.mockResolvedValue(data);
  mocks.pending.mockReturnValue(counts.promise);
  const stream = streamPage(await Page());
  try {
    await vi.waitFor(() => expect(stream.html()).toContain("Test tenancy"));
    expect(mocks.auth).toHaveBeenCalledExactlyOnceWith(["admin","management_viewer"]);
    expect(mocks.pending).toHaveBeenCalledOnce();
    expect(stream.html()).toContain("Preview invoices");
    expect(stream.html()).toContain("Review pending invoice packs");
    counts.resolve(347);
    await vi.waitFor(() => expect(stream.html()).toContain("347"));
    expect(stream.errors).toEqual([]);
  } finally {
    counts.resolve(347);
    stream.close();
  }
});

it("does not ask for an approval count or show admin-only package links for a management viewer", async () => {
  mocks.auth.mockResolvedValue({id:"viewer",role:"management_viewer",full_name:"Viewer"});
  mocks.settings.mockResolvedValue(data);
  const stream = streamPage(await Page());
  try {
    await vi.waitFor(() => expect(stream.html()).toContain("Test tenancy"));
    expect(mocks.pending).not.toHaveBeenCalled();
    expect(stream.html()).not.toContain("Review pending invoice packs");
    expect(stream.html()).not.toContain("Customer invoice packages");
    expect(stream.html()).toContain("Office printer");
  } finally {
    stream.close();
  }
});
