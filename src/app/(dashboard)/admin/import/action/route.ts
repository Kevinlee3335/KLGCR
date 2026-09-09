import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { googleFormDate, googleFormTime, roomAccessPermission } from "@/lib/google-form";

function parseDelimited(text: string) {
  const delimiter = text.split(/\r?\n/,1)[0]?.includes("\t") ? "\t" : ",";
  const rows:string[][]=[]; let row:string[]=[]; let cell=""; let quoted=false;
  for(let i=0;i<text.length;i++) { const c=text[i]; if(c==='"'){ if(quoted && text[i+1]==='"'){cell+='"';i++;} else quoted=!quoted; } else if(c===delimiter && !quoted){row.push(cell.trim());cell="";} else if((c==='\n'||c==='\r')&&!quoted){ if(c==='\r'&&text[i+1]==='\n')i++; row.push(cell.trim()); if(row.some(Boolean))rows.push(row); row=[];cell="";} else cell+=c; }
  row.push(cell.trim()); if(row.some(Boolean))rows.push(row); return rows;
}
function norm(v:string){return v.toLowerCase().replace(/[^a-z0-9]/g,"");}
function value(record:Record<string,string>, names:string[]){ for(const n of names){const v=record[norm(n)]; if(v) return v;} return ""; }
function blockCode(raw:string){const m=raw.toUpperCase().match(/(?:BLOCK\s*)?([ABCD])\b/);return m?.[1]??"";}

export async function POST(request: Request) {
  const profile = await requireRole(["admin"]);
  const form = await request.formData();
  const file = form.get("file");
  const pasted = String(form.get("pasted") ?? "").trim();
  let text = pasted; let fileName:string|null=null;
  if(file instanceof File && file.size>0){text=await file.text();fileName=file.name;}
  if(!text.trim()) return NextResponse.redirect(new URL("/admin/import?error=Please+choose+a+CSV+file+or+paste+rows",request.url),303);
  const rows=parseDelimited(text.replace(/^\uFEFF/,""));
  if(rows.length<2) return NextResponse.redirect(new URL("/admin/import?error=No+data+rows+found",request.url),303);
  const headers=rows[0].map(norm); const supabase=await createClient();
  const {data:blocks,error:blockError}=await supabase.from("blocks").select("id,code");
  if(blockError) return NextResponse.redirect(new URL(`/admin/import?error=${encodeURIComponent(blockError.message)}`,request.url),303);
  const blockMap=new Map((blocks??[]).map(b=>[b.code,b.id]));
  let imported=0,skipped=0,errors=0; const errorNotes:string[]=[];
  for(let index=1;index<rows.length;index++){
    const rec:Record<string,string>={}; headers.forEach((h,i)=>rec[h]=rows[index][i]??"");
    const block=blockCode(value(rec,["BLOCK","Building"])); const room=value(rec,["ROOM NUMBER / COMMON AREA","Room","Room No","Room Number"]); const category=value(rec,["MAINTENANCE TYPE","Category","Complaint Category","Type"]); const description=value(rec,["REPORT DESCRIPTION","Description","Complaint","Issue","Problem"]);
    if(!blockMap.has(block)||!room||!category||!description){errors++;errorNotes.push(`Row ${index+1}: missing/invalid Block, Room, Category or Description`);continue;}
    const responseId=value(rec,["Response ID","Form Response ID","ID"]); const timestamp=value(rec,["Timestamp","Submitted At","Date"]);
    const fingerprint=createHash("sha256").update(`${block}|${room}|${category}|${description}|${timestamp}`).digest("hex").slice(0,32);
    const sourceReference=responseId?`google:${responseId}`:`sheet:${fingerprint}`;
    const priorityRaw=value(rec,["Priority"]).toLowerCase(); const priority=["low","normal","high","urgent"].includes(priorityRaw)?priorityRaw:"normal";
    const preferredDate=googleFormDate(value(rec,["ROOM AVAILABILITY (DATE)","Room Availability Date","Preferred Date"]));
    const preferredTime=googleFormTime(value(rec,["ROOM AVAILABILITY (TIME)","Room Availability Time","Preferred Time"]));
    const access=roomAccessPermission(value(rec,["REQUEST FOR ROOM ACCESS DUE TO TENANT'S UNAVAILABILITY","Room Access Permission","Room Access"]));
    if(!preferredDate||!preferredTime||!access){errors++;errorNotes.push(`Row ${index+1}: missing/invalid room availability date, time or access permission`);continue;}
    const appointmentRequired=access==="no";
    const reporterName=value(rec,["NAME","Complainant Name","Student Name"]);
    const reporterPhone=value(rec,["PHONE NUMBER (WHATSAPP)","Contact","Phone"]);
    const reporterEmail=value(rec,["EMAIL ADDRESS","Email Address","Email"]);
    const {error}=await supabase.from("complaints").insert({source:"google_form",block_id:blockMap.get(block),room_no:room,complainant_name:reporterName||null,complainant_contact:reporterPhone||reporterEmail||null,reporter_name:reporterName||null,reporter_phone:reporterPhone||null,reporter_email:reporterEmail||null,category,description,priority,status:"new",source_reference:sourceReference,photo_url:value(rec,["PHOTO (IF APPLICABLE)","Photo URL","Photo","Google Drive Photo","Attachment"])||null,availability_date:preferredDate,availability_time:preferredTime,preferred_date:preferredDate,preferred_time:preferredTime,room_access_permission:access,appointment_required:appointmentRequired,need_appointment:appointmentRequired});
    if(error){if(error.code==="23505") skipped++; else {errors++;errorNotes.push(`Row ${index+1}: ${error.message}`);}} else imported++;
  }
  await supabase.from("google_import_history").insert({imported_by:profile.id,file_name:fileName,total_rows:rows.length-1,imported_rows:imported,skipped_rows:skipped,error_rows:errors,notes:errorNotes.slice(0,5).join(" | ")||null});
  return NextResponse.redirect(new URL(`/admin/import?ok=${imported}&skipped=${skipped}&errors=${errors}`,request.url),303);
}
