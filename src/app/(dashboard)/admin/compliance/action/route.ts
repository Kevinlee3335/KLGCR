import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request:Request){
 await requireRole(["admin"]);const form=await request.formData();const url=new URL("/admin/compliance",request.url);const recordType=String(form.get("recordType")||"");const title=String(form.get("title")||"").trim();const due=String(form.get("nextDueDate")||"");
 if(!["servicing","certificate_license"].includes(recordType)||!title||!due){url.searchParams.set("error","Choose a type, enter a name and next due date.");return NextResponse.redirect(url,303);}
 const db=await createClient();const {error}=await db.from("compliance_records").insert({record_type:recordType,title,provider:String(form.get("provider")||"").trim()||null,reference_no:String(form.get("referenceNo")||"").trim()||null,last_completed_date:String(form.get("lastCompletedDate")||"")||null,next_due_date:due,status:String(form.get("status")||"active"),notes:String(form.get("notes")||"").trim()||null});
 if(error)url.searchParams.set("error",error.message);else url.searchParams.set("success","1");return NextResponse.redirect(url,303);
}