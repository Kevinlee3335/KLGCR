/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAppNotifications } from "@/lib/app-notifications";

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
    const { data: job, error: jobError } = await db.from("maintenance_jobs").select("job_no,assigned_to,scheduled_for").eq("id", jobId).maybeSingle();
    if (jobError || !job) return redirect(request, date, jobError?.message || "Active job not found");
    const {error}=await db.rpc("schedule_job",{p_job_id:jobId,p_date:date});
    if (error) return redirect(request,date,error.message);
    if (job.assigned_to && job.scheduled_for !== date) {
      try { await createAppNotifications({ recipientIds: [job.assigned_to], type: "job_assigned", title: "Maintenance job scheduled", body: `${job.job_no} is scheduled for ${date}.`, href: `/staff/jobs/${jobId}`, entityId: jobId }); }
      catch (notificationError) { console.error("Unable to notify scheduled maintenance staff", notificationError); }
    }
    return redirect(request,date);
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
    const assignedTo=String(form.get("assignedTo")||"");
    const frequency=String(form.get("frequency")||"once");
    const {data:employee}=await db.from("profiles").select("id").eq("id",assignedTo).eq("is_active",true).is("deleted_at",null).maybeSingle();
    if(!employee || !["once","weekly","biweekly","monthly"].includes(frequency))return redirect(request,date,"Choose an active employee and valid recurrence");
    if(frequency!=="once"){
      const monthlyDate=String(form.get("monthlyDate")||"");
      const day=frequency==="monthly" ? Number(monthlyDate.slice(8,10)) : Number(form.get("dayNumber"));
      if(!Number.isInteger(day)||((frequency==="weekly"||frequency==="biweekly")?(day<0||day>6):(day<1||day>31)))return redirect(request,date,"Invalid recurrence day");
      const { data: recurrence, error } = await db.from("recurring_daily_tasks").insert({title,notes:notes||null,assigned_to:assignedTo,created_by:profile.id,frequency,day_number:day,starts_on:date}).select("id").single();
      if(error)return redirect(request,date,error.message);
      const {error:generateError}=await db.rpc("materialize_recurring_tasks",{p_date:date});
      if (generateError) return redirect(request,date,generateError.message);
      const { data: task } = await db.from("admin_daily_tasks").select("id").eq("recurrence_id", recurrence.id).eq("task_date", date).maybeSingle();
      if (task) {
        try { await createAppNotifications({ recipientIds: [assignedTo], type: "job_assigned", title: "New daily task assigned", body: `${title} is scheduled for ${date}.`, href: "/staff/tasks", entityId: String(task.id) }); }
        catch (notificationError) { console.error("Unable to notify recurring daily-task assignee", notificationError); }
      }
      return redirect(request,date);
    }
    const { data: task, error } = await db.from("admin_daily_tasks").insert({task_date:date,title,notes:notes||null,assigned_to:assignedTo,created_by:profile.id}).select("id").single();
    if (error) return redirect(request,date,error.message);
    try { await createAppNotifications({ recipientIds: [assignedTo], type: "job_assigned", title: "New daily task assigned", body: `${title} is scheduled for ${date}.`, href: "/staff/tasks", entityId: String(task.id) }); }
    catch (notificationError) { console.error("Unable to notify daily-task assignee", notificationError); }
    return redirect(request,date);
  }

  if(action==="recurrence_stop"){
    const{error}=await db.from("recurring_daily_tasks").update({is_active:false}).eq("id",String(form.get("recurrenceId")||""));
    return redirect(request,date,error?.message);
  }

  if(action==="admin_task_status"){
    const id=Number(form.get("taskId"));
    const status=String(form.get("status")??"pending");
    const comment=String(form.get("comment")||"").trim()||null;
    const{error}=await db.rpc("admin_update_daily_task",{p_id:id,p_status:status,p_comment:comment});
    return error?redirect(request,date,error.message):redirect(request,date);
  }

  if(action==="admin_task_delete"){
    const id=Number(form.get("taskId"));
    const{error}=await db.from("admin_daily_tasks").delete().eq("id",id);
    return error?redirect(request,date,error.message):redirect(request,date);
  }

  return redirect(request,date,"unknown action");
}
