/* eslint-disable @typescript-eslint/no-explicit-any */
import {beforeEach,describe,it,expect,vi} from "vitest";
const state=vi.hoisted(()=>({actor:{id:"admin",role:"admin"},tables:{} as Record<string,any[]>,objects:[] as any[],notifications:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireRole:vi.fn(async(roles:string[])=>{if(!roles.includes(state.actor.role))throw new Error("Forbidden");return state.actor})}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(url)}}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/app-notifications",()=>({createAppNotifications:state.notifications,notifyActiveAdmins:state.notifications}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({storage:{from:()=>({upload:async()=>({error:null}),list:async()=>({data:state.objects,error:null})})},from:(table:string)=>{
 const rows=state.tables[table]||[],filters:((r:any)=>boolean)[]=[];let patch:any=null,insert:any=null;
 const result=()=>{if(insert){state.tables[table]??=[];state.tables[table].push(...(Array.isArray(insert)?insert:[insert]));return {data:null,error:null}}const matches=rows.filter(r=>filters.every(f=>f(r)));if(patch)matches.forEach(r=>Object.assign(r,patch));return {data:matches.map(r=>table==="checkout_rooms"?{...r,defects:state.tables.checkout_defects.filter(d=>d.checkout_room_id===r.id)}:r),error:null}};
 const q:any={select:()=>q,or:()=>q,update:(p:any)=>{patch=p;return q},insert:(p:any)=>{insert=p;return q},eq:(k:string,v:any)=>{filters.push(r=>r[k]===v);return q},is:(k:string,v:any)=>{filters.push(r=>r[k]===v);return q},not:(k:string,_op:string,v:any)=>{filters.push(r=>r[k]!==v);return q},in:(k:string,v:any[])=>{filters.push(r=>v.includes(r[k]));return q},single:async()=>{const r=result();return {...r,data:r.data?.[0]||null}},maybeSingle:async()=>{const r=result();return {...r,data:r.data?.[0]||null}},then:(resolve:any)=>Promise.resolve(result()).then(resolve)};return q;
 }})}));
import {handToCleaning,markReady,completeInspection} from "@/app/(dashboard)/admin/checkouts/actions";
import {completeRectification,completeCleaning} from "@/app/(dashboard)/staff/checkouts/actions";
import {checkoutProgress} from "./checkouts";
function form(values:Record<string,string|string[]>={},photo=false){const f=new FormData();for(const [k,v]of Object.entries(values))for(const x of Array.isArray(v)?v:[v])f.append(k,x);if(photo)f.append("photo",new File(["photo"],"evidence.jpg",{type:"image/jpeg"}));return f}
const room=()=>state.tables.checkout_rooms[0];
beforeEach(()=>{state.actor={id:"admin",role:"admin"};state.notifications.mockClear();state.objects=[];state.tables={checkout_rooms:[{id:"room",reference_no:"TEST",room_no:"TEST",deleted_at:null,status:"rectification",assigned_to:"tech",cleaner_id:null}],checkout_defects:[{id:"a",checkout_room_id:"room",description:"Fan",status:"open"},{id:"b",checkout_room_id:"room",description:"Tap",status:"open"}],profiles:[{id:"cleaner",role:"cleaner",is_active:true}],checkout_history:[],checkout_photos:[]}});
describe("check-out server action flow (isolated database)",()=>{
 it("persists partial repairs, completes repairs, cleans and verifies readiness",async()=>{
 state.actor={id:"tech",role:"maintenance_staff"};
 await expect(completeRectification("room",form({rectifiedDefects:["a"],notes:"Fan fixed"},true))).rejects.toThrow("/staff/checkouts/room");
 expect(room().status).toBe("rectification");expect(state.tables.checkout_photos[0].defect_id).toBe("a");expect(checkoutProgress(state.tables.checkout_defects).percent).toBe(50);
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

it("stores all seven legacy uploaded photos and rejects 21 before updating defects",async()=>{
 state.actor={id:"tech",role:"maintenance_staff"};
 const f=form({rectifiedDefects:["a"]});
 for(let i=0;i<7;i++)f.append("photo",new File(["photo"],`photo${i}.jpg`,{type:"image/jpeg"}));
 await expect(completeRectification("room",f)).rejects.toThrow("/staff/checkouts/room");
 expect(state.tables.checkout_photos).toHaveLength(7);
 const tooMany=form({rectifiedDefects:["b"]});
 for(let i=0;i<21;i++)tooMany.append("photo",new File(["photo"],`photo${i}.jpg`,{type:"image/jpeg"}));
 await expect(completeRectification("room",tooMany)).rejects.toThrow("1%20and%2020");
 expect(state.tables.checkout_photos).toHaveLength(7);
 expect(state.tables.checkout_defects.find(d=>d.id==="b").status).toBe("open");
});

it("saves all 20 directly uploaded photos together before updating the defect",async()=>{
 state.actor={id:"tech",role:"maintenance_staff"};
 const f=form({rectifiedDefects:["a"]});
 for(let i=0;i<20;i++){const name=`${crypto.randomUUID()}.jpg`;state.objects.push({name,metadata:{size:5}});f.append("photoPaths",`room/completion/${name}`);}
 await expect(completeRectification("room",f)).rejects.toThrow("/staff/checkouts/room");
 expect(state.tables.checkout_photos).toHaveLength(20);
 expect(state.tables.checkout_photos.every(p=>p.defect_id==="a")).toBe(true);
 expect(state.tables.checkout_defects.find(d=>d.id==="a").status).toBe("rectified");
});
it("rejects missing direct uploads without marking a defect complete",async()=>{
 state.actor={id:"tech",role:"maintenance_staff"};
 const f=form({rectifiedDefects:["a"],photoPaths:`room/completion/${crypto.randomUUID()}.jpg`});
 await expect(completeRectification("room",f)).rejects.toThrow("incomplete");
 expect(state.tables.checkout_photos).toHaveLength(0);
 expect(state.tables.checkout_defects.find(d=>d.id==="a").status).toBe("open");
});

it("Admin manual inspection preserves seven signed-upload photos and assigns maintenance",async()=>{
 room().status="second_inspection";
 state.tables.profiles.push({id:"tech",role:"maintenance_staff",is_active:true,full_name:"Abdullah"});
 const f=form({assignee:"tech",notes:"Inspection confirmed"});
 for(let i=0;i<7;i++){const name=crypto.randomUUID()+".jpg";state.objects.push({name,metadata:{size:10}});f.append("photoPaths","room/inspection/"+name);}
 await expect(completeInspection("room",f)).rejects.toThrow("/admin/checkouts/room");
 expect(room().status).toBe("rectification");expect(room().assigned_to).toBe("tech");
 expect(state.tables.checkout_photos).toHaveLength(7);expect(state.tables.checkout_photos.every(p=>p.kind==="inspection")).toBe(true);
});
it("Admin manual inspection does not assign when any uploaded photo is missing",async()=>{
 room().status="second_inspection";state.tables.profiles.push({id:"tech",role:"maintenance_staff",is_active:true,full_name:"Abdullah"});
 const f=form({assignee:"tech",photoPaths:"room/inspection/"+crypto.randomUUID()+".jpg"});
 await expect(completeInspection("room",f)).rejects.toThrow("incomplete");
 expect(room().status).toBe("second_inspection");expect(state.tables.checkout_photos).toHaveLength(0);
});
