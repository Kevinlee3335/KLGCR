"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const go=(id:string,error?:string)=>redirect(`/admin/checkouts/${id}${error?`?error=${encodeURIComponent(error)}`:""}`);
async function history(db:Awaited<ReturnType<typeof createClient>>, roomId:string, actor:string, action:string, notes?:string, from_status?:string, to_status?:string){return db.from("checkout_history").insert({checkout_room_id:roomId,actor_id:actor,action,notes:notes||null,from_status:from_status||null,to_status:to_status||null});}
async function upload(db:Awaited<ReturnType<typeof createClient>>, roomId:string, actor:string, file:File, kind:"inspection"|"completion"|"cleaning", defectId?:string){
 if(!file.size)return null; if(file.size>10*1024*1024) throw new Error("Each photo must be 10 MB or smaller."); if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Photos must be JPG, PNG, or WebP.");
 const ext=file.name.split(".").pop()?.toLowerCase()||"jpg"; const path=`${roomId}/${kind}/${crypto.randomUUID()}.${ext}`;
 const {error}=await db.storage.from("checkout-evidence").upload(path,file,{contentType:file.type}); if(error)throw error;
 const saved=await db.from("checkout_photos").insert({checkout_room_id:roomId,defect_id:defectId||null,kind,storage_path:path,uploaded_by:actor}); if(saved.error)throw saved.error; return path;
}
export async function createCheckout(data: FormData) {
  const actor = await requireRole(["admin"]);
  const db = await createClient();
  const block = String(data.get("block") || "");
  const room = String(data.get("room") || "").trim();

  let defects: string[] = [];
  try {
    const parsed = JSON.parse(String(data.get("defectsJson") || "[]"));
    if (Array.isArray(parsed)) {
      defects = parsed
        .map((value) => typeof value === "string" ? value.trim().slice(0, 500) : "")
        .filter(Boolean)
        .slice(0, 30);
    }
  } catch {
    // The old textarea format remains accepted only if a malformed request is submitted.
    defects = String(data.get("defects") || "").split(/\n+/).map((value) => value.trim()).filter(Boolean).slice(0, 30);
  }

  if (!block || !room || !defects.length) {
    redirect("/admin/checkouts?error=Block%2C+room+and+at+least+one+reported+defect+are+required");
  }

  const defectSummary = defects.join("\n");
  const { data: checkoutRoom, error } = await db.from("checkout_rooms")
    .insert({ block_id: Number(block), room_no: room, utmspace_defects: defectSummary, created_by: actor.id })
    .select("id")
    .single();

  if (error || !checkoutRoom) {
    redirect(`/admin/checkouts?error=${encodeURIComponent(error?.message || "Unable to create record")}`);
  }

  const result = await db.from("checkout_defects").insert(
    defects.map((description) => ({ checkout_room_id: checkoutRoom.id, description, source: "utmspace", created_by: actor.id })),
  );
  if (result.error) go(checkoutRoom.id, result.error.message);

  await history(db, checkoutRoom.id, actor.id, "record_created", "Reported defects added", undefined, "second_inspection");
  revalidatePath("/admin/checkouts");
  go(checkoutRoom.id);
}
export async function completeInspection(id: string, data: FormData) {
  const actor = await requireRole(["admin"]);
  const db = await createClient();
  const notes = String(data.get("notes") || "").trim();
  const assignee = String(data.get("assignee") || "");
  if (!assignee) go(id, "Assign Abdullah or Faiz before sending for rectification.");

  let addedDefects: string[] = [];
  try {
    const parsed = JSON.parse(String(data.get("inspectionDefectsJson") || "[]"));
    if (Array.isArray(parsed)) {
      addedDefects = parsed
        .map((value) => typeof value === "string" ? value.trim().slice(0, 500) : "")
        .filter(Boolean)
        .slice(0, 30);
    }
  } catch {
    // Ignore an invalid client payload. The existing recorded defects remain intact.
  }

  if (addedDefects.length) {
    const insert = await db.from("checkout_defects").insert(
      addedDefects.map((description) => ({
        checkout_room_id: id,
        description,
        source: "second_inspection",
        created_by: actor.id,
      })),
    );
    if (insert.error) go(id, insert.error.message);
  }

  try {
    for (const file of data.getAll("photos")) if (file instanceof File) await upload(db, id, actor.id, file, "inspection");
  } catch (error) {
    go(id, error instanceof Error ? error.message : "Photo upload failed");
  }

  const update = await db.from("checkout_rooms")
    .update({ inspection_notes: notes || null, assigned_to: assignee, status: "rectification" })
    .eq("id", id)
    .eq("status", "second_inspection");
  if (update.error) go(id, update.error.message);

  await history(db, id, actor.id, "inspection_completed", notes, "second_inspection", "rectification");
  revalidatePath(`/admin/checkouts/${id}`);
  go(id);
}
export async function handToCleaning(id:string,data:FormData){const actor=await requireRole(["admin"]);const cleaner=String(data.get("cleaner")||"");if(!cleaner)go(id,"Select a Cleaner / Housekeeping user.");const db=await createClient();const u=await db.from("checkout_rooms").update({cleaner_id:cleaner,status:"cleaning"}).eq("id",id).eq("status","verification");if(u.error)go(id,u.error.message);await history(db,id,actor.id,"handed_to_housekeeping",undefined,"verification","cleaning");revalidatePath(`/admin/checkouts/${id}`);go(id);}
export async function markReady(id:string,data:FormData){const actor=await requireRole(["admin"]);const notes=String(data.get("notes")||"");const db=await createClient();const u=await db.from("checkout_rooms").update({status:"ready_for_occupancy",ready_at:new Date().toISOString()}).eq("id",id).eq("status","verification");if(u.error)go(id,u.error.message);await history(db,id,actor.id,"room_verified_ready",notes,"verification","ready_for_occupancy");revalidatePath(`/admin/checkouts/${id}`);go(id);}

export async function assignCleanerReportedDefect(id:string,data:FormData){
  const actor=await requireRole(["admin"]);
  const assignee=String(data.get("assignee")||"");
  if(!assignee)go(id,"Choose Abdullah or Faiz to rectify the Cleaner report.");
  const db=await createClient();
  const {count,error:countError}=await db.from("checkout_defects").select("id",{count:"exact",head:true}).eq("checkout_room_id",id).eq("source","cleaner").eq("status","open");
  if(countError||!count)go(id,countError?.message||"No open Cleaner defect is available to assign.");
  const update=await db.from("checkout_rooms").update({assigned_to:assignee,cleaner_id:null,status:"rectification"}).eq("id",id).eq("status","cleaning");
  if(update.error)go(id,update.error.message);
  await history(db,id,actor.id,"cleaner_report_assigned_to_maintenance",`${count} Cleaner-reported defect${count===1?"":"s"} assigned for rectification.`,"cleaning","rectification");
  revalidatePath("/admin/checkouts");revalidatePath(`/admin/checkouts/${id}`);revalidatePath("/staff/checkouts");go(id);
}


type BatchRow={block:string;room:string;area?:string;item?:string;issue?:string;exactLocation?:string};
const batchDefect=(row:BatchRow)=>{const item=String(row.item||"").trim(),issue=String(row.issue||"").trim();if(!item&&!issue)return "";const area=String(row.area||"Room").trim()||"Room";const location=String(row.exactLocation||"").trim();return `${area} · ${item||"Reported defect"}${issue?` — ${issue}`:""}${location?` · ${location}`:""}`;};

export async function createCheckoutBatch(data:FormData){
  const actor=await requireRole(["admin"]);
  const db=await createClient();
  let rows:BatchRow[]=[];
  try{const parsed=JSON.parse(String(data.get("batchRowsJson")||"[]"));if(Array.isArray(parsed))rows=parsed.slice(0,3000) as BatchRow[];}catch{}
  const grouped=new Map<string,{block:string;room:string;defects:string[]}>();
  for(const row of rows){
    const block=String(row.block||"").trim().replace(/^block\s*/i,"").toUpperCase();
    const room=String(row.room||"").trim().toUpperCase();
    if(!["A","B","C","D"].includes(block)||!room)continue;
    const key=`${block}|${room}`;const current=grouped.get(key)||{block,room,defects:[]};
    const defect=batchDefect(row);if(defect)current.defects.push(defect);grouped.set(key,current);
  }
  const rooms=[...grouped.values()];
  if(!rooms.length)redirect("/admin/checkouts?error=Paste+at+least+one+valid+Block+and+Room+row");
  if(rooms.length>1000)redirect("/admin/checkouts?error=One+batch+is+limited+to+1%2C000+rooms");
  const {data:blocks,error:blockError}=await db.from("blocks").select("id,code");
  if(blockError)redirect(`/admin/checkouts?error=${encodeURIComponent(blockError.message)}`);
  const blockMap=new Map((blocks||[]).map((block)=>[String(block.code).toUpperCase(),Number(block.id)]));
  const validRooms=rooms.filter((room)=>blockMap.has(room.block));
  if(!validRooms.length)redirect("/admin/checkouts?error=No+valid+blocks+were+found");
  const blockIds=[...new Set(validRooms.map((room)=>blockMap.get(room.block)!))];
  const roomNos=[...new Set(validRooms.map((room)=>room.room))];
  const {data:existing,error:existingError}=await db.from("checkout_rooms").select("block_id,room_no").in("block_id",blockIds).in("room_no",roomNos);
  if(existingError)redirect(`/admin/checkouts?error=${encodeURIComponent(existingError.message)}`);
  const existingKeys=new Set((existing||[]).map((room)=>`${room.block_id}|${String(room.room_no).toUpperCase()}`));
  const newRooms=validRooms.filter((room)=>!existingKeys.has(`${blockMap.get(room.block)}|${room.room}`));
  if(!newRooms.length)redirect(`/admin/checkouts?error=${encodeURIComponent("All pasted rooms already have a check-out record.")}`);
  const {data:created,error:createError}=await db.from("checkout_rooms").insert(newRooms.map((room)=>({block_id:blockMap.get(room.block)!,room_no:room.room,utmspace_defects:room.defects.length?room.defects.join("\n"):"No reported defects",created_by:actor.id}))).select("id,block_id,room_no");
  if(createError||!created?.length)redirect(`/admin/checkouts?error=${encodeURIComponent(createError?.message||"Unable to create check-out batch")}`);
  const roomIdByKey=new Map(created.map((room)=>[`${room.block_id}|${String(room.room_no).toUpperCase()}`,room.id]));
  const defects=newRooms.flatMap((room)=>room.defects.map((description)=>({checkout_room_id:roomIdByKey.get(`${blockMap.get(room.block)}|${room.room}`)!,description,source:"utmspace",created_by:actor.id})));
  if(defects.length){const {error}=await db.from("checkout_defects").insert(defects);if(error)redirect(`/admin/checkouts?error=${encodeURIComponent("Rooms were created, but some defects could not be saved: "+error.message)}`);}
  const historyRows=created.map((room)=>({checkout_room_id:room.id,actor_id:actor.id,action:"batch_record_created",notes:"Created through batch check-out import.",to_status:"second_inspection"}));
  const {error:historyError}=await db.from("checkout_history").insert(historyRows);
  if(historyError)console.error("batch checkout history failed",historyError.message);
  revalidatePath("/admin/checkouts");revalidatePath("/admin/analysis");
  redirect(`/admin/checkouts?success=${created.length}&skipped=${validRooms.length-newRooms.length}`);
}
