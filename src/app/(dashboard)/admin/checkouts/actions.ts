"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAppNotifications } from "@/lib/app-notifications";
import { createClient } from "@/lib/supabase/server";

const go=(id:string,error?:string)=>redirect(`/admin/checkouts/${id}${error?`?error=${encodeURIComponent(error)}`:""}`);
function pickedDefects(value:FormDataEntryValue|null){try{const parsed=JSON.parse(String(value||"[]"));if(!Array.isArray(parsed))return [];return parsed.map((row)=>String(row?.description||"").trim()).filter((description)=>description.length>0&&description.length<=2000).slice(0,20);}catch{return [];}}
async function history(db:Awaited<ReturnType<typeof createClient>>, roomId:string, actor:string, action:string, notes?:string, from_status?:string, to_status?:string){return db.from("checkout_history").insert({checkout_room_id:roomId,actor_id:actor,action,notes:notes||null,from_status:from_status||null,to_status:to_status||null});}
async function upload(db:Awaited<ReturnType<typeof createClient>>, roomId:string, actor:string, file:File, kind:"inspection"|"completion"|"cleaning", defectId?:string){
 if(!file.size)return null; if(file.size>10*1024*1024) throw new Error("Each photo must be 10 MB or smaller."); if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Photos must be JPG, PNG, or WebP.");
 const ext=file.name.split(".").pop()?.toLowerCase()||"jpg"; const path=`${roomId}/${kind}/${crypto.randomUUID()}.${ext}`;
 const {error}=await db.storage.from("checkout-evidence").upload(path,file,{contentType:file.type}); if(error)throw error;
 const saved=await db.from("checkout_photos").insert({checkout_room_id:roomId,defect_id:defectId||null,kind,storage_path:path,uploaded_by:actor}); if(saved.error)throw saved.error; return path;
}
export async function createCheckout(data:FormData){const actor=await requireRole(["admin"]);const db=await createClient();const block=String(data.get("block"));const room=String(data.get("room")||"").trim();const selectedDefects=pickedDefects(data.get("checkoutDefects"));const legacyDefects=String(data.get("defects")||"").trim();const defects=selectedDefects.length?selectedDefects.join("\n"):legacyDefects;if(!block||!room||!defects)redirect("/admin/checkouts?error=Block%2C+room+and+UTMSPACE+defects+are+required");const {data:r,error}=await db.from("checkout_rooms").insert({block_id:Number(block),room_no:room,utmspace_defects:defects,created_by:actor.id}).select("id").single();if(error||!r)redirect(`/admin/checkouts?error=${encodeURIComponent(error?.message||"Unable to create record")}`);const rows=defects.split(/\n+/).map(x=>x.replace(/^[-•\d.)\s]+/,"").trim()).filter(Boolean).map(description=>({checkout_room_id:r.id,description,source:"utmspace",created_by:actor.id}));const result=await db.from("checkout_defects").insert(rows);if(result.error)go(r.id,result.error.message);await history(db,r.id,actor.id,"record_created","UTMSPACE check-out defects imported",undefined,"second_inspection");revalidatePath("/admin/checkouts");go(r.id);}
export async function completeInspection(id:string,data:FormData){const actor=await requireRole(["admin"]);const db=await createClient();const notes=String(data.get("notes")||"").trim();const selectedDefects=pickedDefects(data.get("newDefects"));const extra=String(data.get("newDefect")||"").trim();const assignee=String(data.get("assignee")||"");if(!assignee)go(id,"Assign Abdullah or Faiz before sending for rectification.");const newDefects=selectedDefects.length?selectedDefects:(extra?[extra]:[]);if(newDefects.length){const x=await db.from("checkout_defects").insert(newDefects.map(description=>({checkout_room_id:id,description,source:"second_inspection",created_by:actor.id})));if(x.error)go(id,x.error.message);}try{for(const f of data.getAll("photos"))if(f instanceof File)await upload(db,id,actor.id,f,"inspection");}catch(e){go(id,e instanceof Error?e.message:"Photo upload failed");}const u=await db.from("checkout_rooms").update({inspection_notes:notes||null,assigned_to:assignee,status:"rectification"}).eq("id",id).eq("status","second_inspection");if(u.error)go(id,u.error.message);await history(db,id,actor.id,"inspection_completed",notes,"second_inspection","rectification");revalidatePath(`/admin/checkouts/${id}`);go(id);}
export async function handToCleaning(id:string,data:FormData){const actor=await requireRole(["admin"]);const cleaner=String(data.get("cleaner")||"");if(!cleaner)go(id,"Select a Cleaner / Housekeeping user.");const db=await createClient();const {data:room,error:roomError}=await db.from("checkout_rooms").select("reference_no,room_no").eq("id",id).single();if(roomError||!room)go(id,roomError?.message||"Check-out room not found.");const roomInfo=room as {reference_no:string|null;room_no:string};const u=await db.from("checkout_rooms").update({cleaner_id:cleaner,status:"cleaning"}).eq("id",id).eq("status","verification");if(u.error)go(id,u.error.message);await history(db,id,actor.id,"handed_to_housekeeping",undefined,"verification","cleaning");try{await createAppNotifications({recipientIds:[cleaner],type:"checkout_assigned",title:"New check-out room for cleaning",body:`${roomInfo.reference_no||"Check-out room"} — Room ${roomInfo.room_no} is ready for cleaning.`,href:`/staff/checkouts/${id}`,entityId:id});}catch(error){console.error("Unable to notify cleaner about check-out room",error);}revalidatePath(`/admin/checkouts/${id}`);revalidatePath("/staff/checkouts");go(id);}
export async function markReady(id:string,data:FormData){const actor=await requireRole(["admin"]);const notes=String(data.get("notes")||"");const db=await createClient();const u=await db.from("checkout_rooms").update({status:"ready_for_occupancy",ready_at:new Date().toISOString()}).eq("id",id).eq("status","verification");if(u.error)go(id,u.error.message);await history(db,id,actor.id,"room_verified_ready",notes,"verification","ready_for_occupancy");revalidatePath(`/admin/checkouts/${id}`);go(id);}
export type BatchCheckoutInput={blockId:number;roomNo:string;defects:string[]};
export async function createCheckoutBatch(input:BatchCheckoutInput[]){
 const actor=await requireRole(["admin"]);const db=await createClient();
 if(!Array.isArray(input)||!input.length)return {error:"Choose a valid Excel file with at least one room."};
 if(input.length>1000)return {error:"Import up to 1,000 rooms at one time."};
 const seen=new Set<string>();const rooms:BatchCheckoutInput[]=[];
 for(const row of input){const blockId=Number(row.blockId);const roomNo=String(row.roomNo||"").trim();const defects=[...new Set((row.defects||[]).map(x=>String(x).trim()).filter(Boolean))];
  if(!Number.isInteger(blockId)||blockId<=0||!roomNo||!defects.length)return {error:"Every row needs Block, Room and at least one defect."};
  if(roomNo.length>80||defects.some(x=>x.length>2000))return {error:"One room number or defect description is too long."};
  const roomKey=blockId+":"+roomNo.toLowerCase();if(seen.has(roomKey))return {error:"Duplicate room in this file: "+roomNo+"."};seen.add(roomKey);rooms.push({blockId,roomNo,defects});
 }
 const {data:existing,error:existingError}=await db.from("checkout_rooms").select("block_id,room_no");
 if(existingError)return {error:existingError.message};
 const present=new Set((existing||[]).map(r=>String(r.block_id)+":"+String(r.room_no).toLowerCase()));
 const fresh=rooms.filter(r=>!present.has(String(r.blockId)+":"+r.roomNo.toLowerCase()));
 if(!fresh.length)return {error:"All rooms in this file are already in Check-out Rooms."};
 const {data:created,error:createError}=await db.from("checkout_rooms").insert(fresh.map(r=>({block_id:r.blockId,room_no:r.roomNo,utmspace_defects:r.defects.join("\n"),created_by:actor.id}))).select("id,block_id,room_no");
 if(createError||!created)return {error:createError?.message||"Unable to create the check-out rooms."};
 const ids=new Map(created.map(r=>[String(r.block_id)+":"+String(r.room_no).toLowerCase(),r.id]));
 const defects=fresh.flatMap(r=>r.defects.map(description=>({checkout_room_id:ids.get(String(r.blockId)+":"+r.roomNo.toLowerCase()),description,source:"utmspace",created_by:actor.id})));
 const defectResult=await db.from("checkout_defects").insert(defects);
 if(defectResult.error)return {error:"Rooms were created but defects could not be saved: "+defectResult.error.message};
 const historyResult=await db.from("checkout_history").insert(created.map(r=>({checkout_room_id:r.id,actor_id:actor.id,action:"record_created",notes:"UTMSPACE batch check-out defects imported",from_status:null,to_status:"second_inspection"})));
 if(historyResult.error)return {error:"Rooms were created but history could not be saved: "+historyResult.error.message};
 revalidatePath("/admin/checkouts");return {ok:true,created:created.length,skipped:rooms.length-fresh.length};
}
