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
