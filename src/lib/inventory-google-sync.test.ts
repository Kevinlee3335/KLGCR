import { afterEach, describe, expect, it, vi } from "vitest";
import { normaliseInventorySheetRow, pushInventoryItemToGoogle } from "./inventory-google-sync";
const item={item_code:"KLGCR-E00069",description:"Restart button",category:"Electrical",movement_category:"slow",balance_qty:2,reorder_level:1,unit:"unit"};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();});
describe("Google inventory sync",()=>{
  it("maps legacy sheet codes to the existing prefixed app item",()=>{
    expect(normaliseInventorySheetRow({itemCode:"E00069",description:"Restart button",category:"Electrical",balanceQty:2})?.itemCode).toBe("KLGCR-E00069");
    expect(normaliseInventorySheetRow({itemCode:"KLGCR-E00069",description:"Restart button",category:"Electrical",balanceQty:2})?.itemCode).toBe("KLGCR-E00069");
  });
  it("reports a 200 response with an Apps Script error as failed",async()=>{
    vi.stubEnv("GOOGLE_INVENTORY_APPS_SCRIPT_URL","https://script.example.test/exec");vi.stubEnv("GOOGLE_INVENTORY_SYNC_SECRET","test-secret");
    vi.spyOn(console,"error").mockImplementation(()=>{});
    const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:false,error:"Item code not found"}),{status:200}));vi.stubGlobal("fetch",fetch);
    expect(await pushInventoryItemToGoogle(item)).toEqual({skipped:false,ok:false});
    expect(JSON.parse(fetch.mock.calls[0][1].body).item).toMatchObject({itemCode:"E00069",balanceQty:2});
  });
  it("accepts only explicit acknowledgement from Google",async()=>{
    vi.stubEnv("GOOGLE_INVENTORY_APPS_SCRIPT_URL","https://script.example.test/exec");vi.stubEnv("GOOGLE_INVENTORY_SYNC_SECRET","test-secret");
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true}),{status:200})));
    expect(await pushInventoryItemToGoogle(item)).toEqual({skipped:false,ok:true});
  });
});
