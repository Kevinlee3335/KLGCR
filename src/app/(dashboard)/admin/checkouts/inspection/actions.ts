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
