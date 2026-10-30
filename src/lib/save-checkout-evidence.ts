import { createClient } from "@/lib/supabase/server";
import { MAX_EVIDENCE_PHOTOS, validateEvidenceFiles } from "@/lib/photo-limits";
async function photo(db:Awaited<ReturnType<typeof createClient>>,id:string,user:string,file:File,kind:"inspection"|"completion"|"cleaning",defectId?:string){if(!file.size)throw new Error("Upload at least one completion photo.");if(file.size>10485760||!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Use a JPG, PNG or WebP photo up to 10 MB.");const path=`${id}/${kind}/${crypto.randomUUID()}.${file.name.split(".").pop()||"jpg"}`;const up=await db.storage.from("checkout-evidence").upload(path,file,{contentType:file.type});if(up.error)throw up.error;const row=await db.from("checkout_photos").insert({checkout_room_id:id,defect_id:defectId||null,kind,storage_path:path,uploaded_by:user});if(row.error)throw row.error;}
export async function saveCheckoutEvidence(db:Awaited<ReturnType<typeof createClient>>,id:string,user:string,data:FormData,kind:"inspection"|"completion"|"cleaning",defectId?:string){
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
