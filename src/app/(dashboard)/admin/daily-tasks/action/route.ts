/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function redirect(request:Request,date:string,error?:string){
  const url=new URL("/admin/daily-tasks",request.url);
  if(date)url.searchParams.set("date",date);
  if(error)url.searchParams.set("error",error);
  return NextResponse.redirect(url,303);
}

export async function POST(request: Request) {
  const profile=await requireRole(["admin"]);
  const form=await request.formData();
  const action=String(form.get("action")??"schedule");
  const date=String(form.get("date")??"");
  const supabase=await createClient();
  const db:any=supabase;

  if(action==="schedule"){
    const jobId=String(form.get("jobId")??"");
    if(!jobId||!/^\d{4}-\d{2}-\d{2}$/.test(date))return redirect(request,date,"invalid");
    const{error}=await db.rpc("schedule_job",{p_job_id:jobId,p_date:date});
    return error?redirect(request,date,error.message):redirect(request,date);
  }

  if(action==="work_state"){
    const jobId=String(form.get("jobId")??"");
    const workState=String(form.get("workState")??"standard");
    const{error}=await db.rpc("set_job_work_state",{p_job_id:jobId,p_work_state:workState});
    return error?redirect(request,date,error.message):redirect(request,date);
  }

  if(action==="admin_task_create"){
    const title=String(form.get("title")??"").trim();
    const notes=String(form.get("notes")??"").trim();
    if(!title||!/^\d{4}-\d{2}-\d{2}$/.test(date))return redirect(request,date,"invalid admin task");
    const{error}=await db.from("admin_daily_tasks").insert({task_date:date,title,notes:notes||null,created_by:profile.id});
    return error?redirect(request,date,error.message):redirect(request,date);
  }

  if(action==="admin_task_status"){
    const id=Number(form.get("taskId"));
    const status=String(form.get("status")??"pending");
    const{error}=await db.from("admin_daily_tasks").update({status,updated_at:new Date().toISOString()}).eq("id",id);
    return error?redirect(request,date,error.message):redirect(request,date);
  }

  if(action==="admin_task_delete"){
    const id=Number(form.get("taskId"));
    const{error}=await db.from("admin_daily_tasks").delete().eq("id",id);
    return error?redirect(request,date,error.message):redirect(request,date);
  }

  return redirect(request,date,"unknown action");
}
