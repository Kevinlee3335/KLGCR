// @vitest-environment node
import { expect, it, vi } from "vitest";
import { POST } from "./route";
import { createClient } from "@/lib/supabase/server";
import { pushInventoryItemToGoogle } from "@/lib/inventory-google-sync";

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

it.each(["edit_item","reject_item","cancel_item"])("routes %s to the atomic item function without issuing stock",async action=>{
  const rpc=vi.fn().mockResolvedValue({error:null});
  const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{id:"request-1",requested_by:"staff-1",items:[]}})};
  vi.mocked(createClient).mockResolvedValue({from:()=>query,rpc} as unknown as Awaited<ReturnType<typeof createClient>>);
  const form=new FormData();
  Object.entries({action,requestId:"request-1",requestItemId:"line-1",reason:"Correct size",expectedInventoryItemId:"stock-20",expectedRequestedQty:"1",expectedApprovedQty:"",inventoryItemId:"stock-15",requestedQty:"2"}).forEach(([key,value])=>form.set(key,value));
  const response=await POST(new Request("https://klgcr.example/admin/material-requests/action",{method:"POST",body:form,headers:{referer:"https://klgcr.example/admin/material-requests?status=pending"}}));
  expect(rpc).toHaveBeenCalledExactlyOnceWith("amend_material_request_item",{
    p_request_id:"request-1",p_item_id:"line-1",p_action:action.replace("_item",""),p_reason:"Correct size",
    p_expected_inventory_item_id:"stock-20",p_expected_requested_qty:1,p_expected_approved_qty:null,p_inventory_item_id:"stock-15",p_requested_qty:2,
  });
  expect(pushInventoryItemToGoogle).not.toHaveBeenCalled();
  const location=new URL(response.headers.get("location")!);
  expect(location.searchParams.get("success")).toBe(action); expect(location.searchParams.get("status")).toBe("pending");
});
