"use server";
import {requireCheckoutInspector} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {revalidatePath} from "next/cache";
import {isUUID} from "@/lib/checkout-inspection";
import {EVIDENCE_TYPES,MAX_EVIDENCE_BYTES} from "@/lib/photo-limits";
import {signCheckoutPhotoUploads} from "@/lib/checkout-photo-uploads";

export async function prepareInspectionPhotos(id:string,files:{type:string;size:number}[]){
 const actor=await requireCheckoutInspector();
 if(!isUUID(id)||!Array.isArray(files)||files.length>20||files.some(f=>!EVIDENCE_TYPES.has(f.type)||f.size<=0||f.size>MAX_EVIDENCE_BYTES))return {error:"Use up to 20 JPG, PNG or WebP photos, 10 MB each."};
 const db=await createClient();
 return signCheckoutPhotoUploads(db.storage.from("checkout-evidence"), `${actor.id}/inspection/${id}`, files, "Unable to prepare upload.");
}
export async function submitABInspection(input:{id:string;block:string;room:string;pax:number;notes:string;checklist:unknown;findings:{description:string;photos:string[]}[]}){
 await requireCheckoutInspector();
 if(!isUUID(input.id)||!["A","B"].includes(input.block)||!/^\d{3}$/.test(input.room)||!Array.isArray(input.findings)||input.findings.length>100||input.notes.length>4000)return {error:"Invalid inspection. Please check the room and try again."};
 const db=await createClient();
 const {data,error}=await db.rpc("submit_ab_checkout_inspection",{p_id:input.id,p_block:input.block,p_room:input.room,p_pax:input.pax,p_notes:input.notes,p_checklist:input.checklist,p_findings:input.findings});
 if(error)return {error:error.message};
 revalidatePath("/admin/checkouts");
 return {ok:true,room:data as {id:string;reference_no:string}};
}

export async function getRecentRoomInspection(roomCode:string) {
 const actor=await requireCheckoutInspector();
 if(actor.role!=="admin"||typeof roomCode!=="string"||!/^[AB]\d{3}$/.test(roomCode)) return {record:null};

 const block=roomCode[0];
 const number=roomCode.slice(1);
 const now=new Date();
 const since=new Date(now.getTime()-30*24*60*60*1000);
 const malaysiaDate=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"});
 const firstDay=malaysiaDate.format(since);
 const today=malaysiaDate.format(now);
 const firstInstant=new Date(`${firstDay}T00:00:00+08:00`).toISOString();
 const db=await createClient();
 const {data:rooms,error}=await db.from("checkout_rooms")
  .select("id,created_at,status,ready_at,inspection_checklist,blocks!inner(code)")
  .eq("blocks.code",block)
  .in("room_no",[number,roomCode,`${block}-${number}`,`${block} ${number}`])
  .is("deleted_at",null)
  .not("inspection_checklist","is",null)
  .gte("created_at",firstInstant)
  .order("created_at",{ascending:false})
  .order("id",{ascending:false});
 if(error) return {error:"Could not check previous inspections. Please try again."};
 const room=rooms.map(entry=>{
  const date=entry.inspection_checklist?.date;
  const hasDate=typeof date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date));
  return {...entry,day:hasDate?date:malaysiaDate.format(new Date(entry.created_at)),inspectedAt:hasDate?date:entry.created_at};
 }).filter(entry=>entry.day>=firstDay&&entry.day<=today)
  .sort((first,second)=>second.day.localeCompare(first.day))[0];
 if(!room) return {record:null};

 const [defects,history]=await Promise.all([
  db.from("checkout_defects").select("description,status,rectified_at").eq("checkout_room_id",room.id),
  db.from("checkout_history").select("action,created_at").eq("checkout_room_id",room.id)
   .in("action",["cleaning_completed","super_admin_cleaning_completed","rectification_completed"])
   .order("created_at",{ascending:false}),
 ]);
 if(defects.error||history.error) return {error:"Could not load repair and cleaning history. Please try again."};

 const repairs=defects.data.filter(defect=>!/^(no defects?)[.!]?$/i.test(defect.description.trim()));
 const remaining=repairs.filter(defect=>defect.status!=="rectified").length;
 const repairedAt=history.data.find(event=>event.action==="rectification_completed")?.created_at
  ?? repairs.flatMap(defect=>defect.rectified_at?[defect.rectified_at]:[]).sort().at(-1)??null;
 const cleanedAt=history.data.find(event=>event.action!=="rectification_completed")?.created_at
  ?? (room.status==="ready_for_occupancy"?room.ready_at:null);
 return {record:{
  id:room.id,
  inspectedAt:room.inspectedAt,
  defectCount:repairs.length,
  remaining,
  repairedAt,
  cleanedAt,
  status:room.status,
 }};
}
