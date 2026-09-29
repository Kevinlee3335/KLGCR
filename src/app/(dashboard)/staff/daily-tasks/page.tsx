/* eslint-disable @typescript-eslint/no-explicit-any */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function StaffDailyTasks({searchParams}:{searchParams:Promise<{date?:string;error?:string}>}){
  const profile=await requireRole(["maintenance_staff","cleaner"]);
  const params=await searchParams;
  const date=params.date||new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const db=await createClient();
  const {data:tasks,error}=await db.from("admin_daily_tasks").select("id,title,notes,status,task_date,accepted_at,started_at,completed_at,activity:daily_task_activity(id,action,comment,created_at,actor:profiles!daily_task_activity_actor_id_fkey(full_name))").eq("assigned_to",profile.id).lte("task_date",date).order("task_date",{ascending:false});
  async function update(form:FormData){
    "use server";
    await requireRole(["maintenance_staff","cleaner"]);
    const {error}=await (await createClient()).rpc("update_assigned_daily_task",{p_id:Number(form.get("id")),p_status:String(form.get("status")),p_comment:String(form.get("comment")||"")||null});
    if(error)redirect(`/staff/daily-tasks?error=${encodeURIComponent(error.message)}`);
    revalidatePath("/staff/daily-tasks"); revalidatePath("/admin/daily-tasks");
  }
  return <AppShell profile={profile} title="Daily Tasks"><h2>My Daily Tasks</h2><form><input type="date" name="date" defaultValue={date}/><button className="button">View</button></form>{(params.error||error)&&<p className="error">{params.error||error?.message}</p>}{tasks?.filter(task=>task.task_date===date||task.status!=="completed").map((task:any)=><section className="panel" key={task.id}><h3>{task.title}</h3><p>{task.task_date} · {task.notes}</p><p className="subtle">Status: {String(task.status).replaceAll("_"," ")}</p><form action={update} className="form-grid"><input type="hidden" name="id" value={task.id}/><label className="field"><span>Status</span><select name="status" defaultValue={task.status}><option value="accepted">Accepted</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="kiv">KIV</option></select></label><label className="field field-wide"><span>Comment</span><textarea name="comment" rows={3} maxLength={1000} placeholder="Write work progress or completion comment"/></label><button className="button">Save Update</button></form><details style={{marginTop:14}}><summary>Timeline</summary>{task.activity?.length?<ol className="activity-timeline">{task.activity.map((entry:any)=><li key={entry.id}><div className="activity-marker"/><time><strong>{new Intl.DateTimeFormat("en-MY",{timeZone:"Asia/Kuala_Lumpur",day:"2-digit",month:"short",year:"numeric"}).format(new Date(entry.created_at))}</strong><span>{new Intl.DateTimeFormat("en-MY",{timeZone:"Asia/Kuala_Lumpur",hour:"2-digit",minute:"2-digit",hour12:true}).format(new Date(entry.created_at))}</span></time><div className="activity-content"><strong>{entry.action}</strong>{entry.actor?.full_name&&<span className="activity-actor">{entry.actor.full_name}</span>}{entry.comment&&<p>{entry.comment}</p>}</div></li>)}</ol>:<p className="subtle">No progress update yet.</p>}</details></section>)}{!tasks?.length&&<p>No assigned daily tasks.</p>}</AppShell>;
}
