/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReportKind = "morning_tasks" | "midday_update" | "daily_summary" | "progress_snapshot" | "inventory_report";
export type BlockGroup = "AB" | "CD" | "ALL";

type JobRow = { job_no:string; room_no:string; status:string; work_state:string; category:string; scheduled_for:string|null; completed_at:string|null; blocks:{code:string}|null; profiles:{full_name:string}|null };
function malaysiaDateString(date=new Date()){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).format(date)}
function displayDate(value:string){const [y,m,d]=value.split("-");return `${d}/${m}/${y}`}
function groupCodes(group:BlockGroup){if(group==="AB")return["A","B"];if(group==="CD")return["C","D"];return["A","B","C","D"]}
function titleFor(kind:ReportKind){return{morning_tasks:"9:00 AM MORNING TASK",midday_update:"12:00 PM MIDDAY UPDATE",daily_summary:"4:50 PM DAILY SUMMARY",progress_snapshot:"3-HOUR PROGRESS",inventory_report:"INVENTORY REPORT"}[kind]}
function groupTitle(group:BlockGroup){return group==="AB"?"BLOCK A & B":group==="CD"?"BLOCK C & D":"OVERALL"}
function jobLines(j:JobRow){return [j.job_no,`📍 Block ${j.blocks?.code??"-"} | Room ${j.room_no}`,`🔧 ${j.category}`,`👤 ${j.profiles?.full_name??"Unassigned"}`]}
function uniqueJobs(rows:JobRow[]){return rows.filter((j,i,a)=>a.findIndex(x=>x.job_no===j.job_no)===i)}

export async function buildReport(supabase:SupabaseClient,kind:ReportKind,group:BlockGroup){
 const today=malaysiaDateString(),codes=groupCodes(group),db:any=supabase;
 const {data:blocks,error:blockError}=await db.from("blocks").select("id,code").in("code",codes);if(blockError)throw blockError;const blockIds=(blocks??[]).map((r:any)=>r.id);
 if(kind==="inventory_report"){
  const {data,error}=await db.from("inventory_items").select("item_code,description,category,movement_category,balance_qty,reorder_level,cost,unit").eq("is_active",true).order("movement_category").order("description");if(error)throw error;const items=data??[],out=items.filter((i:any)=>Number(i.balance_qty)===0),near=items.filter((i:any)=>Number(i.balance_qty)>0&&Number(i.balance_qty)<=Number(i.reorder_level));
  const lines=[`*KLGCR | ${titleFor(kind)}*`,`📅 ${displayDate(today)}`,"",`📦 Total Items: ${items.length}`,`🔴 Out of Stock: ${out.length}`,`🟡 Near Reorder: ${near.length}`,"","*🔴 OUT OF STOCK*",...(out.length?out.slice(0,20).map((i:any)=>`• ${i.item_code} | ${i.description} | ${i.balance_qty} ${i.unit??""}`):["None"]),"","*🟡 NEAR REORDER*",...(near.length?near.slice(0,20).map((i:any)=>`• ${i.item_code} | ${i.description} | ${i.balance_qty} ${i.unit??""}`):["None"])];
  return{reportDate:today,payload:{total:items.length,out_of_stock:out,near_reorder:near,items},whatsappText:lines.join("\n")};
 }
 const [{data,error},{data:issuedRows},{data:adminTasks}]=await Promise.all([
  db.from("maintenance_jobs").select("job_no,room_no,status,work_state,category,scheduled_for,completed_at,blocks(code),profiles!maintenance_jobs_assigned_to_fkey(full_name)").in("block_id",blockIds).order("assigned_at",{ascending:true}),
  db.from("inventory_issue_history").select("id,qty,issued_at,inventory_items(item_code,description,unit),maintenance_jobs(job_no,room_no,blocks(code)),profiles!inventory_issue_history_staff_id_fkey(full_name)").gte("issued_at",`${today}T00:00:00+08:00`).lt("issued_at",`${today}T23:59:59.999+08:00`).order("issued_at",{ascending:true}),
  db.from("admin_daily_tasks").select("id,title,notes,status").eq("task_date",today).order("created_at",{ascending:true})]);if(error)throw error;
 const jobs=(data??[]) as JobRow[],active=jobs.filter(j=>!["completed","verified","closed","cancelled"].includes(j.status)),scheduledToday=active.filter(j=>j.scheduled_for===today),completedToday=jobs.filter(j=>j.completed_at&&malaysiaDateString(new Date(j.completed_at))===today),pendingMaterial=active.filter(j=>j.status==="pending_material"),monitoring=active.filter(j=>j.status==="under_monitoring"),inProgress=active.filter(j=>["in_progress","paused"].includes(j.status)),assigned=active.filter(j=>["assigned","accepted","reopened"].includes(j.status)),partially=active.filter(j=>j.work_state==="partially_completed"),appointments=active.filter(j=>j.work_state==="appointment"),kiv=active.filter(j=>j.work_state==="kiv"),materialsIssued=((issuedRows??[]) as any[]).filter(r=>codes.includes(r.maintenance_jobs?.blocks?.code));
 const lines=[`*KLGCR | ${titleFor(kind)} | ${groupTitle(group)}*`,`📅 ${displayDate(today)}`,"","*📊 TODAY'S SUMMARY*",`Scheduled: ${scheduledToday.length}`,`Completed: ${completedToday.length}`,`In Progress: ${inProgress.length}`,`Pending Material: ${pendingMaterial.length}`,`Under Monitoring: ${monitoring.length}`,`Partially Completed: ${partially.length}`,`Appointment: ${appointments.length}`,`KIV: ${kiv.length}`,`Assigned: ${assigned.length}`];
 const addJobs=(heading:string,rows:JobRow[])=>{lines.push("",`*${heading}*`);if(!rows.length){lines.push("None");return}rows.slice(0,25).forEach((j,i)=>{if(i)lines.push("");lines.push(...jobLines(j))})};
 if(kind==="morning_tasks")addJobs("📋 TODAY'S TASKS",scheduledToday);
 else if(kind==="daily_summary"){
  if(completedToday.length)addJobs("✅ COMPLETED TODAY",completedToday);
  addJobs("🔴 PENDING MATERIAL",pendingMaterial);addJobs("🟡 UNDER MONITORING",monitoring);
  if(inProgress.length)addJobs("🔵 IN PROGRESS",inProgress);if(appointments.length)addJobs("📅 APPOINTMENT",appointments);if(kiv.length)addJobs("⏸️ KIV",kiv);
 } else addJobs("📋 CURRENT JOBS",active);
 lines.push("","*📋 ADMIN TASKS*");if(adminTasks?.length)(adminTasks as any[]).slice(0,20).forEach(t=>lines.push(`• ${t.title} | ${String(t.status).replaceAll("_"," ")}${t.notes?` | ${t.notes}`:""}`));else lines.push("None");
 if(kind!=="morning_tasks"){lines.push("","*📦 MATERIAL ISSUED TODAY*");if(materialsIssued.length)materialsIssued.slice(0,20).forEach((r:any)=>lines.push(`• ${r.inventory_items?.item_code??"-"} ${r.inventory_items?.description??""} | ${r.qty} ${r.inventory_items?.unit??""} | ${r.maintenance_jobs?.job_no??"-"} | Block ${r.maintenance_jobs?.blocks?.code??"-"} ${r.maintenance_jobs?.room_no??""} | ${r.profiles?.full_name??"-"}`));else lines.push("None")}
 const carry=uniqueJobs([...pendingMaterial,...monitoring,...inProgress,...assigned,...partially,...appointments,...kiv]);if(kind==="daily_summary")lines.push("",`*➡️ CARRY FORWARD TO NEXT DAY: ${carry.length} JOB${carry.length===1?"":"S"}*`);
 return{reportDate:today,payload:{scheduled_today:scheduledToday,completed_today:completedToday,active,admin_tasks:adminTasks??[],materials_issued:materialsIssued,counts:{scheduled_today:scheduledToday.length,completed_today:completedToday.length,in_progress:inProgress.length,pending_material:pendingMaterial.length,under_monitoring:monitoring.length,partially_completed:partially.length,appointment:appointments.length,kiv:kiv.length,assigned:assigned.length}},whatsappText:lines.join("\n")};
}
