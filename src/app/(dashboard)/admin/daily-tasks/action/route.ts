/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function redirect(request:Request,date:string,error?:string,category?:string){
  const url=new URL("/admin/daily-tasks",request.url);
  if(date)url.searchParams.set("date",date);
  if(category)url.searchParams.set("category",category);
  if(error)url.searchParams.set("error",error);
  return NextResponse.redirect(url,303);
}

export async function POST(request: Request) {
  const profile=await requireRole(["admin"]);
  const form=await request.formData();
  const action=String(form.get("action")??"schedule");
  const date=String(form.get("date")??"");
  const category=String(form.get("taskCategory")??"");
  const supabase=await createClient();
  const db:any=supabase;

  if(action==="schedule"){
    const jobId=String(form.get("jobId")??"");
    if(!jobId||!/^\d{4}-\d{2}-\d{2}$/.test(date))return redirect(request,date,"invalid",category);
    const{error}=await db.rpc("schedule_job",{p_job_id:jobId,p_date:date});
    return error?redirect(request,date,error.message,category):redirect(request,date,undefined,category);
  }

  if(action==="work_state"){
    const jobId=String(form.get("jobId")??"");
    const workState=String(form.get("workState")??"standard");
    const{error}=await db.rpc("set_job_work_state",{p_job_id:jobId,p_work_state:workState});
    return error?redirect(request,date,error.message,category):redirect(request,date,undefined,category);
  }

  if(action==="admin_task_create"){
    const title=String(form.get("title")??"").trim();
    const notes=String(form.get("notes")??"").trim();
    if(!title||!/^\d{4}-\d{2}-\d{2}$/.test(date))return redirect(request,date,"invalid daily task",category);
    const assignedTo=String(form.get("assignedTo")||"");
    const frequency=String(form.get("frequency")||"once");
    const taskCategory=String(form.get("taskCategory")||"");
    if(!["admin","operation","housekeeping"].includes(taskCategory))return redirect(request,date,"Choose a task category",category);
    const {data:employee}=await db.from("profiles").select("id").eq("id",assignedTo).eq("is_active",true).is("deleted_at",null).maybeSingle();
    if(!employee || !["once","weekly","biweekly","monthly"].includes(frequency))return redirect(request,date,"Choose an active employee and valid recurrence",taskCategory);
    if(frequency!=="once"){
      const monthlyDate=String(form.get("monthlyDate")||"");
      const day=frequency==="monthly" ? Number(monthlyDate.slice(8,10)) : Number(form.get("dayNumber"));
      if(!Number.isInteger(day)||((frequency==="weekly"||frequency==="biweekly")?(day<0||day>6):(day<1||day>31)))return redirect(request,date,"Invalid recurrence day",taskCategory);
      const{error}=await db.from("recurring_daily_tasks").insert({title,notes:notes||null,assigned_to:assignedTo,created_by:profile.id,frequency,day_number:day,starts_on:date,task_category:taskCategory});
      if(error)return redirect(request,date,error.message,taskCategory);
      const {error:generateError}=await db.rpc("materialize_recurring_tasks",{p_date:date});
      return redirect(request,date,generateError?.message,taskCategory);
    }
    const{error}=await db.from("admin_daily_tasks").insert({task_date:date,title,notes:notes||null,assigned_to:assignedTo,created_by:profile.id,task_category:taskCategory});
    return error?redirect(request,date,error.message,taskCategory):redirect(request,date,undefined,taskCategory);
  }

  if(action==="recurrence_stop"){
    const{error}=await db.from("recurring_daily_tasks").update({is_active:false}).eq("id",String(form.get("recurrenceId")||""));
    return redirect(request,date,error?.message,category);
  }

  if(action==="admin_task_status"){
    const id=Number(form.get("taskId"));
    const status=String(form.get("status")??"pending");
    const comment=String(form.get("comment")||"").trim()||null;
    const{error}=await db.rpc("admin_update_daily_task",{p_id:id,p_status:status,p_comment:comment});
    return error?redirect(request,date,error.message,category):redirect(request,date,undefined,category);
  }

  if(action==="admin_task_delete"){
    const id=Number(form.get("taskId"));
    const{error}=await db.from("admin_daily_tasks").delete().eq("id",id);
    return error?redirect(request,date,error.message,category):redirect(request,date,undefined,category);
  }

  return redirect(request,date,"unknown action",category);
}
