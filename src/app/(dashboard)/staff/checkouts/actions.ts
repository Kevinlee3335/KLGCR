"use server";
import { MAX_EVIDENCE_PHOTOS, EVIDENCE_TYPES, MAX_EVIDENCE_BYTES, validateEvidenceFiles } from "@/lib/photo-limits";
import { checkoutProgress,isRepairDefect } from "@/lib/checkouts";
import { revalidatePath } from "next/cache";import { redirect } from "next/navigation";import { requireRole } from "@/lib/auth";import { notifyActiveAdmins } from "@/lib/app-notifications";import { createClient } from "@/lib/supabase/server";
function go(id:string,e?:string):never {return redirect(`/staff/checkouts/${id}${e?`?error=${encodeURIComponent(e)}`:""}`)}
async function photo(db:Awaited<ReturnType<typeof createClient>>,id:string,user:string,file:File,kind:"completion"|"cleaning",defectId?:string){if(!file.size)throw new Error("Upload at least one completion photo.");if(file.size>10485760||!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Use a JPG, PNG or WebP photo up to 10 MB.");const path=`${id}/${kind}/${crypto.randomUUID()}.${file.name.split(".").pop()||"jpg"}`;const up=await db.storage.from("checkout-evidence").upload(path,file,{contentType:file.type});if(up.error)throw up.error;const row=await db.from("checkout_photos").insert({checkout_room_id:id,defect_id:defectId||null,kind,storage_path:path,uploaded_by:user});if(row.error)throw row.error;}
export async function completeRectification(id:string,data:FormData){
 const actor=await requireRole(["maintenance_staff"]);const db=await createClient();
 const {data:room}=await db.from("checkout_rooms").select("id").is("deleted_at",null).is("deleted_at",null).eq("id",id).eq("assigned_to",actor.id).eq("status","rectification").maybeSingle();
 if(!room)go(id,"This room is not assigned to you for rectification.");
 const {data:defects,error:readError}=await db.from("checkout_defects").select("id,description,status").eq("checkout_room_id",id);
 if(readError)go(id,readError.message);
 const selected=new Set(data.getAll("rectifiedDefects").map(String));
 const open=(defects||[]).filter(d=>d.status==="open"&&isRepairDefect(d));
 const ids=open.filter(d=>selected.has(d.id)).map(d=>d.id);
 if(!ids.length)go(id,"Select at least one open defect to mark as rectified.");
 try{await saveCheckoutEvidence(db,id,actor.id,data,"completion",ids.length===1?ids[0]:undefined);}catch(e){go(id,e instanceof Error?e.message:"Upload failed");}
 const {error:d}=await db.from("checkout_defects").update({status:"rectified",rectified_by:actor.id,rectified_at:new Date().toISOString()}).eq("checkout_room_id",id).eq("status","open").in("id",ids);
 if(d)go(id,d.message);
 const {data:current,error:currentError}=await db.from("checkout_defects").select("description,status").eq("checkout_room_id",id);
 if(currentError)go(id,currentError.message);
 const remaining=checkoutProgress(current||[]).remaining;
 if(!remaining){const u=await db.from("checkout_rooms").update({status:"verification"}).is("deleted_at",null).eq("id",id).eq("assigned_to",actor.id).eq("status","rectification").select("id").maybeSingle();if(u.error||!u.data)go(id,u.error?.message||"Room stage changed. Refresh to see current progress.");}
 await db.from("checkout_history").insert({checkout_room_id:id,actor_id:actor.id,action:remaining?"rectification_progress":"rectification_completed",notes:`${ids.length} defect(s) rectified. ${remaining} remaining. ${String(data.get("notes")||"")}`,from_status:"rectification",to_status:remaining?"rectification":"verification"});
 revalidatePath(`/staff/checkouts/${id}`);revalidatePath(`/admin/checkouts/${id}`);revalidatePath("/admin/checkouts");go(id);
}
export async function completeCleaning(id:string,data:FormData){const actor=await requireRole(["cleaner"]);const db=await createClient();const {data:room,error:roomError}=await db.from("checkout_rooms").select("reference_no,room_no").is("deleted_at",null).is("deleted_at",null).eq("id",id).eq("cleaner_id",actor.id).eq("status","cleaning").single();if(roomError||!room)go(id,roomError?.message||"Check-out room not found.");const roomInfo=room as {reference_no:string|null;room_no:string};try{await saveCheckoutEvidence(db,id,actor.id,data,"cleaning");}catch(e){go(id,e instanceof Error?e.message:"Upload failed");}const u=await db.from("checkout_rooms").update({status:"verification"}).is("deleted_at",null).eq("id",id).eq("cleaner_id",actor.id).eq("status","cleaning").select("id").maybeSingle();if(u.error||!u.data)go(id,u.error?.message||"Room is no longer awaiting cleaning.");await db.from("checkout_history").insert({checkout_room_id:id,actor_id:actor.id,action:"cleaning_completed",notes:String(data.get("notes")||"")||null,from_status:"cleaning",to_status:"verification"});try{await notifyActiveAdmins({type:"checkout_completed",title:"Cleaning completed",body:`${roomInfo.reference_no||"Check-out room"} — Room ${roomInfo.room_no} is ready for final verification.`,href:`/admin/checkouts/${id}`,entityId:id});}catch(error){console.error("Unable to notify administrators about cleaning completion",error);}revalidatePath(`/staff/checkouts/${id}`);revalidatePath(`/admin/checkouts/${id}`);revalidatePath("/admin/checkouts");go(id);}


export async function prepareCheckoutEvidence(id:string,kind:"completion"|"cleaning",files:{type:string;size:number}[]) {
 const actor=await requireRole(["maintenance_staff","cleaner"]);
 if(!["completion","cleaning"].includes(kind)||!Array.isArray(files)||files.length<1||files.length>MAX_EVIDENCE_PHOTOS||files.some(f=>!EVIDENCE_TYPES.has(f.type)||!Number.isFinite(f.size)||f.size<=0||f.size>MAX_EVIDENCE_BYTES)) return {error:"Attach between 1 and 20 JPG, PNG or WebP photos up to 10 MB each."};
 const db=await createClient();
 const {data:room}=await db.from("checkout_rooms").select("id").eq("id",id).is("deleted_at",null).eq(kind==="completion"?"assigned_to":"cleaner_id",actor.id).eq("status",kind==="completion"?"rectification":"cleaning").maybeSingle();
 if(!room||(kind==="completion"?actor.role!=="maintenance_staff":actor.role!=="cleaner")) return {error:"This room is not assigned to you for this stage."};
 const uploads=[];
 for(const file of files){
  const extension=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
  const path=`${id}/${kind}/${crypto.randomUUID()}.${extension}`;
  const {data,error}=await db.storage.from("checkout-evidence").createSignedUploadUrl(path);
  if(error||!data?.token)return {error:error?.message||"Unable to prepare photo upload."};
  uploads.push({path,token:data.token});
 }
 return {uploads};
}

async function saveCheckoutEvidence(db:Awaited<ReturnType<typeof createClient>>,id:string,user:string,data:FormData,kind:"completion"|"cleaning",defectId?:string){
 const paths=data.getAll("photoPaths");
 if(paths.length){
  const prefix=`${id}/${kind}/`;
  if(paths.length>MAX_EVIDENCE_PHOTOS||new Set(paths).size!==paths.length||paths.some(p=>typeof p!=="string"||!p.startsWith(prefix)||!/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(p.slice(prefix.length))))throw new Error("Attach between 1 and 20 valid completion photos.");
  const {data:objects,error:readError}=await db.storage.from("checkout-evidence").list(`${id}/${kind}`,{limit:1000});
  if(readError||paths.some(p=>!objects?.some(o=>o.name===(p as string).slice(prefix.length)&&Number(o.metadata?.size)>0)))throw new Error("Photo upload is incomplete. Please retry before confirming completion.");
  const {error}=await db.from("checkout_photos").insert(paths.map(storage_path=>({checkout_room_id:id,defect_id:defectId||null,kind,storage_path,uploaded_by:user})));
  if(error)throw new Error(error.message);
  return;
 }
 // Accept in-flight forms from before this release, including multi-file uploads.
 const files=data.getAll("photo").filter((f):f is File=>f instanceof File&&f.size>0);
 const invalid=validateEvidenceFiles(files);if(invalid)throw new Error(invalid);
 for(const file of files)await photo(db,id,user,file,kind,defectId);
}
