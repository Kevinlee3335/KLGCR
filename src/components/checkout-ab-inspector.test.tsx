import {render,screen,waitFor,act,cleanup} from "@testing-library/react";
import {afterEach,beforeEach,it,expect,vi} from "vitest";
const state=vi.hoisted(()=>({prepare:vi.fn(),submit:vi.fn(),upload:vi.fn()}));
vi.mock("@/app/(dashboard)/admin/checkouts/inspection/actions",()=>({prepareInspectionPhotos:state.prepare,submitABInspection:state.submit}));
vi.mock("@/lib/supabase/client",()=>({createClient:()=>({storage:{from:()=>({uploadToSignedUrl:state.upload})}})}));
import {CheckoutABInspector} from "./checkout-ab-inspector";
const record=()=>({id:"00000000-0000-4000-8000-000000000010",room:"A203",b:"A",p:2,date:"2026-10-30",by:"Kevin",reason:"Inspection",items:Array.from({length:5},()=>[{enabled:true,status:"good"},{enabled:false,status:"good"}]),fac:{Fan:{status:"defect",type:"Broken",qty:1,remark:"Stopped",photos:Array(7).fill("data:image/jpeg;base64,cGhvdG8=")}}});
beforeEach(()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>({blob:async()=>new Blob(["photo"],{type:"image/jpeg"})})));
 state.prepare.mockReset().mockResolvedValue({uploads:Array.from({length:7},(_,i)=>({path:"inspection/photo"+i,token:"token"+i}))});
 state.upload.mockReset().mockResolvedValue({error:null});
 state.submit.mockReset().mockResolvedValue({ok:true,room:{id:"room",reference_no:"TEST-COR"}});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
function send(record:unknown){const iframe=screen.getByTitle("Block A and B room inspection") as HTMLIFrameElement;window.dispatchEvent(new MessageEvent("message",{origin:window.location.origin,source:iframe.contentWindow,data:{type:"klg-inspection-submit",record}}))}
it("uploads seven photos, submits one defect form with all paths and prevents duplicate concurrent submits",async()=>{
 render(<CheckoutABInspector/>);
 act(()=>{send(record());send(record())});
 await screen.findByText("Inspection submitted successfully");
 expect(state.prepare).toHaveBeenCalledTimes(1);expect(state.upload).toHaveBeenCalledTimes(7);expect(state.submit).toHaveBeenCalledTimes(1);
 const payload=state.submit.mock.calls[0][0];expect(payload.room).toBe("203");expect(payload.findings).toHaveLength(1);expect(payload.findings[0].photos).toHaveLength(7);expect(payload.findings[0].description).toContain("Fan · Broken");expect(JSON.stringify(payload.checklist)).not.toContain("base64");
});
it("keeps the inspection open and does not create a form if photo seven fails",async()=>{
 state.upload.mockImplementation(async(path:string)=>({error:path.endsWith("6")?{message:"Connection lost"}:null}));
 render(<CheckoutABInspector/>);act(()=>send(record()));
 await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("Photo 7 failed"));
 expect(state.submit).not.toHaveBeenCalled();expect(screen.getByTitle("Block A and B room inspection")).toBeInTheDocument();
 // A retry resends the whole set and links only the successful set.
 state.upload.mockResolvedValue({error:null});act(()=>send(record()));
 await screen.findByText("Inspection submitted successfully");expect(state.submit).toHaveBeenCalledTimes(1);
});
it("rejects messages from another origin without uploading",async()=>{
 render(<CheckoutABInspector/>);
 act(()=>window.dispatchEvent(new MessageEvent("message",{origin:"https://example.com",source:(screen.getByTitle("Block A and B room inspection") as HTMLIFrameElement).contentWindow,data:{type:"klg-inspection-submit",record:record()}})));
 expect(state.prepare).not.toHaveBeenCalled();
});
