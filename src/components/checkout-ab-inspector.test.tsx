import {render,screen,waitFor,act,cleanup,fireEvent} from "@testing-library/react";
import {afterEach,beforeEach,it,expect,vi} from "vitest";
const state=vi.hoisted(()=>({prepare:vi.fn(),submit:vi.fn(),upload:vi.fn(),recent:vi.fn(),refresh:vi.fn()}));
vi.mock("@/app/(dashboard)/admin/checkouts/inspection/actions",()=>({prepareInspectionPhotos:state.prepare,submitABInspection:state.submit,getRecentRoomInspection:state.recent}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:state.refresh})}));
vi.mock("@/lib/supabase/client",()=>({createClient:()=>({storage:{from:()=>({uploadToSignedUrl:state.upload})}})}));
import {CheckoutABInspector} from "./checkout-ab-inspector";
const record=()=>({id:"00000000-0000-4000-8000-000000000010",room:"A203",b:"A",p:2,date:"2026-10-30",by:"Kevin",reason:"Inspection",items:Array.from({length:5},()=>[{enabled:true,status:"good"},{enabled:false,status:"good"}]),fac:{Fan:{status:"defect",type:"Broken",qty:1,remark:"Stopped",photos:Array(7).fill("data:image/jpeg;base64,cGhvdG8=")}}});
beforeEach(()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>({blob:async()=>new Blob(["photo"],{type:"image/jpeg"})})));
 state.prepare.mockReset().mockResolvedValue({uploads:Array.from({length:7},(_,i)=>({path:"inspection/photo"+i,token:"token"+i}))});
 state.upload.mockReset().mockResolvedValue({error:null});
 state.submit.mockReset().mockResolvedValue({ok:true,room:{id:"room",reference_no:"TEST-COR"}});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()});
function send(record:unknown){const iframe=screen.getByTitle("Block A and B room inspection") as HTMLIFrameElement;window.dispatchEvent(new MessageEvent("message",{origin:window.location.origin,source:iframe.contentWindow,data:{type:"klg-inspection-submit",record}}))}
it("uploads photos in parallel and submits one defect form with all paths in order",async()=>{
 let finishFirst!: (result:{error:null})=>void;
 const first=new Promise<{error:null}>(resolve=>{finishFirst=resolve});
 state.upload.mockImplementation((path:string)=>path.endsWith("0")?first:Promise.resolve({error:null}));
 render(<CheckoutABInspector/>);
 act(()=>{send(record());send(record())});
 await screen.findByText("Uploaded 6 of 7 photos…");
 expect(state.submit).not.toHaveBeenCalled();
 await act(async()=>{finishFirst({error:null})});
 await screen.findByText("Inspection submitted successfully");
 expect(state.prepare).toHaveBeenCalledTimes(1);expect(state.upload).toHaveBeenCalledTimes(7);expect(state.submit).toHaveBeenCalledTimes(1);
 const payload=state.submit.mock.calls[0][0];expect(payload.room).toBe("203");expect(payload.findings).toHaveLength(1);expect(payload.findings[0].photos).toEqual(Array.from({length:7},(_,i)=>"inspection/photo"+i));expect(payload.findings[0].description).toContain("Fan · Broken");expect(JSON.stringify(payload.checklist)).not.toContain("base64");
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

function selectRoom(room:string|null,request:number,startAfter=false) {
 const frame=screen.getByTitle("Block A and B room inspection") as HTMLIFrameElement;
 window.dispatchEvent(new MessageEvent("message",{
  origin:window.location.origin,source:frame.contentWindow,
  data:{type:"klg-inspection-recent",room,request,startAfter},
 }));
}
const recentRoom={id:"existing-room",inspectedAt:"2026-11-12",defectCount:3,remaining:0,
 repairedAt:"2026-11-14T07:40:00Z",cleanedAt:"2026-11-15T03:10:00Z",status:"ready_for_occupancy"};

it("shows matching inspection history before starting, and continues only on request",async()=>{
 const prototype=HTMLDialogElement.prototype;
 Object.defineProperties(prototype,{
  showModal:{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}},
  close:{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}},
 });
 state.recent.mockResolvedValue({record:recentRoom});
 render(<CheckoutABInspector/>);
 const frame=screen.getByTitle("Block A and B room inspection") as HTMLIFrameElement;
 const post=vi.spyOn(frame.contentWindow!,"postMessage");
 act(()=>selectRoom("A222",1));
 await screen.findByRole("dialog");
 expect(screen.getByText("A222 was recently inspected")).toBeVisible();
 expect(screen.getByText("12 Nov 2026")).toBeVisible();
 expect(screen.getByText(/14 Nov 2026 · 3:40/)).toBeVisible();
 expect(screen.getByText(/15 Nov 2026 · 11:10/)).toBeVisible();
 expect(screen.getByRole("link",{name:"View Previous Record"})).toHaveAttribute("href","/admin/checkouts/existing-room");
 expect(post).not.toHaveBeenCalledWith(expect.objectContaining({type:"klg-inspection-continue"}),window.location.origin);
 fireEvent.click(screen.getByRole("button",{name:"Continue Inspection"}));
 expect(post).toHaveBeenCalledWith({type:"klg-inspection-continue",room:"A222",request:1},window.location.origin);
 Reflect.deleteProperty(prototype,"showModal");
 Reflect.deleteProperty(prototype,"close");
});

it("ignores a stale lookup when the search changes and starts normally for a room without recent history",async()=>{
 let resolveFirst:(value:unknown)=>void=()=>{};
 state.recent.mockImplementationOnce(()=>new Promise(resolve=>{resolveFirst=resolve;})).mockResolvedValueOnce({record:null});
 render(<CheckoutABInspector/>);
 const frame=screen.getByTitle("Block A and B room inspection") as HTMLIFrameElement;
 const post=vi.spyOn(frame.contentWindow!,"postMessage");
 act(()=>{selectRoom("A222",1);selectRoom("B222",2,true);});
 await waitFor(()=>expect(post).toHaveBeenCalledWith({type:"klg-inspection-continue",room:"B222",request:2},window.location.origin));
 await act(async()=>resolveFirst({record:recentRoom}));
 expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("sends refreshed repair status into an existing inspection iframe",()=>{
 const original={checklist:record(),created_at:"2026-11-20T03:00:00Z",rectifiedItems:[] as string[]};
 const {rerender}=render(<CheckoutABInspector initialInspections={[original]}/>);
 const frame=screen.getByTitle("Block A and B room inspection") as HTMLIFrameElement;
 const post=vi.spyOn(frame.contentWindow!,"postMessage");
 const refreshed=[{...original,rectifiedItems:["a-Fan"]}];
 rerender(<CheckoutABInspector initialInspections={refreshed}/>);
 expect(post).toHaveBeenCalledWith({type:"klg-inspection-records",records:refreshed},window.location.origin);
});

it.each(["AB","CD"] as const)("sends an empty snapshot and refreshes on focus for %s after End Batch",blocks=>{
 state.refresh.mockReset();
 const {rerender}=render(<CheckoutABInspector blocks={blocks} initialInspections={[{checklist:record(),created_at:"2026-11-20T03:00:00Z"}]}/>);
 const frame=screen.getByTitle(blocks==="AB"?"Block A and B room inspection":"Block C and D room inspection") as HTMLIFrameElement;
 const post=vi.spyOn(frame.contentWindow!,"postMessage");
 rerender(<CheckoutABInspector blocks={blocks} initialInspections={[]}/>);
 expect(post).toHaveBeenCalledWith({type:"klg-inspection-records",records:[]},window.location.origin);
 act(()=>window.dispatchEvent(new Event("focus")));
 expect(state.refresh).toHaveBeenCalledTimes(1);
});

it("submits the C/D checklist and all category photos, and preserves a failed form for retry",async()=>{
 const {CD_CATEGORIES}=await import('@/lib/checkout-cd-inspection');
 const cd={id:'00000000-0000-4000-8000-000000000050',b:'C',room:218,l:2,t:6,round:1,date:'2026-11-20',by:'Kevin',reason:'Inspection',it:Object.fromEntries(CD_CATEGORIES.flatMap(([,items],ci)=>items.map((_,si)=>[`${ci}.${si}`,0]))),nt:{1:'Fan stopped'},ph:{1:['data:image/jpeg;base64,cGhvdG8=']}};
 cd.it['1.0']=2;
 render(<CheckoutABInspector blocks="CD"/>);
 const frame=screen.getByTitle('Block C and D room inspection') as HTMLIFrameElement;
 const sendCD=()=>window.dispatchEvent(new MessageEvent('message',{origin:window.location.origin,source:frame.contentWindow,data:{type:'klg-inspection-submit',record:cd}}));
 state.submit.mockResolvedValueOnce({error:'Connection lost'});
 act(()=>{sendCD();sendCD()});
 await screen.findByText(/Connection lost/);
 expect(screen.getByTitle('Block C and D room inspection')).toBeInTheDocument();
 act(()=>sendCD());await screen.findByText('Inspection submitted successfully');
 const payload=state.submit.mock.calls[1][0];
 expect(payload).toMatchObject({block:'C',room:'218',pax:6});
 expect(payload.findings[0]).toMatchObject({description:'Electrical Fixtures · Wall Fans · Qty 2: Fan stopped',photos:['inspection/photo0']});
 expect(payload.checklist.ph).toEqual({1:['inspection/photo0']});
 expect(JSON.stringify(payload.checklist)).not.toContain('base64');

});

it("opens the existing C/D record instead of starting a duplicate active inspection",async()=>{
 const prototype=HTMLDialogElement.prototype;
 Object.defineProperties(prototype,{showModal:{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}},close:{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}}});
 try{
  state.recent.mockResolvedValue({record:{...recentRoom,status:'rectification',remaining:1}});
  render(<CheckoutABInspector blocks="CD"/>);
  const frame=screen.getByTitle('Block C and D room inspection') as HTMLIFrameElement;
  const post=vi.spyOn(frame.contentWindow!,'postMessage');
  act(()=>window.dispatchEvent(new MessageEvent('message',{origin:window.location.origin,source:frame.contentWindow,data:{type:'klg-inspection-recent',room:'C218',request:1,startAfter:true}})));
  await screen.findByText('C218 has an active check-out record');
  expect(screen.queryByRole('button',{name:'Continue Inspection'})).not.toBeInTheDocument();
  expect(screen.getByRole('link',{name:'View Previous Record'})).toHaveAttribute('href','/admin/checkouts/existing-room');
  expect(post).not.toHaveBeenCalledWith(expect.objectContaining({type:'klg-inspection-continue'}),window.location.origin);
 }finally{cleanup();Reflect.deleteProperty(prototype,'showModal');Reflect.deleteProperty(prototype,'close');}
});
it("refreshes C/D repair and signed-photo data from the iframe while rejecting foreign messages",()=>{
 state.refresh.mockReset();render(<CheckoutABInspector blocks="CD"/>);
 const frame=screen.getByTitle('Block C and D room inspection') as HTMLIFrameElement;
 act(()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://example.com',source:frame.contentWindow,data:{type:'klg-inspection-refresh'}})));
 expect(state.refresh).not.toHaveBeenCalled();
 act(()=>window.dispatchEvent(new MessageEvent('message',{origin:window.location.origin,source:frame.contentWindow,data:{type:'klg-inspection-refresh'}})));
 expect(state.refresh).toHaveBeenCalledTimes(1);
});
