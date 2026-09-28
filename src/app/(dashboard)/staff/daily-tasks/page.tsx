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
  const {data:tasks,error}=await db.from("admin_daily_tasks").select("id,title,notes,status,task_date").eq("assigned_to",profile.id).lte("task_date",date).order("task_date",{ascending:false});
  async function update(form:FormData){
    "use server";
    await requireRole(["maintenance_staff","cleaner"]);
    const {error}=await (await createClient()).rpc("update_assigned_daily_task",{p_id:Number(form.get("id")),p_status:String(form.get("status"))});
    if(error)redirect(`/staff/daily-tasks?error=${encodeURIComponent(error.message)}`);
    revalidatePath("/staff/daily-tasks"); revalidatePath("/admin/daily-tasks");
  }
  return <AppShell profile={profile} title="Daily Tasks"><h2>My Daily Tasks</h2><form><input type="date" name="date" defaultValue={date}/><button className="button">View</button></form>{(params.error||error)&&<p className="error">{params.error||error?.message}</p>}{tasks?.filter(task=>task.task_date===date||task.status!=="completed").map(task=><section className="panel" key={task.id}><h3>{task.title}</h3><p>{task.task_date} · {task.notes}</p><form action={update}><input type="hidden" name="id" value={task.id}/><select name="status" defaultValue={task.status}><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="kiv">KIV</option></select><button className="button">Update</button></form></section>)}{!tasks?.length&&<p>No assigned daily tasks.</p>}</AppShell>;
}
