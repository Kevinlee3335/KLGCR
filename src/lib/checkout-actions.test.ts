/* eslint-disable @typescript-eslint/no-explicit-any */
import {beforeEach,describe,it,expect,vi} from "vitest";
const state=vi.hoisted(()=>({actor:{id:"admin",role:"admin"},tables:{} as Record<string,any[]>,notifications:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireRole:vi.fn(async(roles:string[])=>{if(!roles.includes(state.actor.role))throw new Error("Forbidden");return state.actor})}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(url)}}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/app-notifications",()=>({createAppNotifications:state.notifications,notifyActiveAdmins:state.notifications}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({storage:{from:()=>({upload:async()=>({error:null})})},from:(table:string)=>{
 const rows=state.tables[table]||[],filters:((r:any)=>boolean)[]=[];let patch:any=null,insert:any=null;
 const result=()=>{if(insert){state.tables[table]??=[];state.tables[table].push(...(Array.isArray(insert)?insert:[insert]));return {data:null,error:null}}const matches=rows.filter(r=>filters.every(f=>f(r)));if(patch)matches.forEach(r=>Object.assign(r,patch));return {data:matches.map(r=>table==="checkout_rooms"?{...r,defects:state.tables.checkout_defects.filter(d=>d.checkout_room_id===r.id)}:r),error:null}};
 const q:any={select:()=>q,update:(p:any)=>{patch=p;return q},insert:(p:any)=>{insert=p;return q},eq:(k:string,v:any)=>{filters.push(r=>r[k]===v);return q},is:(k:string,v:any)=>{filters.push(r=>r[k]===v);return q},not:(k:string,_op:string,v:any)=>{filters.push(r=>r[k]!==v);return q},in:(k:string,v:any[])=>{filters.push(r=>v.includes(r[k]));return q},single:async()=>{const r=result();return {...r,data:r.data?.[0]||null}},maybeSingle:async()=>{const r=result();return {...r,data:r.data?.[0]||null}},then:(resolve:any)=>Promise.resolve(result()).then(resolve)};return q;
 }})}));
import {handToCleaning,markReady} from "@/app/(dashboard)/admin/checkouts/actions";
import {completeRectification,completeCleaning} from "@/app/(dashboard)/staff/checkouts/actions";
import {checkoutProgress} from "./checkouts";
function form(values:Record<string,string|string[]>={},photo=false){const f=new FormData();for(const [k,v]of Object.entries(values))for(const x of Array.isArray(v)?v:[v])f.append(k,x);if(photo)f.append("photo",new File(["photo"],"evidence.jpg",{type:"image/jpeg"}));return f}
const room=()=>state.tables.checkout_rooms[0];
beforeEach(()=>{state.actor={id:"admin",role:"admin"};state.notifications.mockClear();state.tables={checkout_rooms:[{id:"room",reference_no:"TEST",room_no:"TEST",deleted_at:null,status:"rectification",assigned_to:"tech",cleaner_id:null}],checkout_defects:[{id:"a",checkout_room_id:"room",description:"Fan",status:"open"},{id:"b",checkout_room_id:"room",description:"Tap",status:"open"}],profiles:[{id:"cleaner",role:"cleaner",is_active:true}],checkout_history:[],checkout_photos:[]}});
describe("check-out server action flow (isolated database)",()=>{
 it("persists partial repairs, completes repairs, cleans and verifies readiness",async()=>{
 state.actor={id:"tech",role:"maintenance_staff"};
 await expect(completeRectification("room",form({rectifiedDefects:["a"],notes:"Fan fixed"},true))).rejects.toThrow("/staff/checkouts/room");
 expect(room().status).toBe("rectification");expect(checkoutProgress(state.tables.checkout_defects).percent).toBe(50);
 await expect(completeRectification("room",form({rectifiedDefects:["b"]},true))).rejects.toThrow("/staff/checkouts/room");expect(room().status).toBe("verification");
 state.actor={id:"admin",role:"admin"};await expect(handToCleaning("room",form({cleaner:"cleaner"}))).rejects.toThrow("/admin/checkouts/room");expect(room().status).toBe("cleaning");
 state.actor={id:"cleaner",role:"cleaner"};await expect(completeCleaning("room",form({},true))).rejects.toThrow("/staff/checkouts/room");expect(room().status).toBe("verification");
 state.actor={id:"admin",role:"admin"};await expect(markReady("room",form({pax:"2",notes:"Verified"}))).rejects.toThrow("/admin/checkouts/room");expect(room().status).toBe("ready_for_occupancy");expect(room().occupancy_pax).toBe(2);expect(state.tables.checkout_history).toHaveLength(5);
 });
 it("directly assigns a No Defect room and preserves its original marker",async()=>{room().status="second_inspection";room().utmspace_defects="No Defect";state.tables.checkout_defects=[{id:"none",checkout_room_id:"room",description:"No Defect",status:"open"}];await expect(handToCleaning("room",form({cleaner:"cleaner"}))).rejects.toThrow("/admin/checkouts/room");expect(room().status).toBe("cleaning");expect(state.tables.checkout_defects[0].description).toBe("No Defect");expect(state.tables.checkout_history[0].from_status).toBe("second_inspection")});
 it("blocks housekeeping with outstanding defects and rejects duplicate handovers",async()=>{room().status="verification";await expect(handToCleaning("room",form({cleaner:"cleaner"}))).rejects.toThrow("not%20ready");expect(state.tables.checkout_history).toHaveLength(0);room().status="cleaning";await expect(handToCleaning("room",form({cleaner:"cleaner"}))).rejects.toThrow("not%20ready");expect(state.notifications).not.toHaveBeenCalled()});

 it("blocks final readiness with unresolved repairs",async()=>{room().status="verification";room().cleaner_id="cleaner";await expect(markReady("room",form({pax:"2"}))).rejects.toThrow("Complete%20all%20repair");expect(room().status).toBe("verification");expect(state.tables.checkout_history).toHaveLength(0)});
 it("rejects unassigned repair submissions without changing records",async()=>{state.actor={id:"other",role:"maintenance_staff"};await expect(completeRectification("room",form({rectifiedDefects:["a"]},true))).rejects.toThrow("not%20assigned");expect(checkoutProgress(state.tables.checkout_defects).percent).toBe(0);expect(state.tables.checkout_history).toHaveLength(0)});
});
