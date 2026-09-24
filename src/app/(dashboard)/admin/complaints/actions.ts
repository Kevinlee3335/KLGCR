"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { appointmentTimeValues, validateComplaintAppointmentSelection } from "@/lib/appointments";
import { createAppNotifications } from "@/lib/app-notifications";

const complaintSchema=z.object({source:z.enum(["google_form","manual","cleaning","flex","other"]),blockId:z.coerce.number().int().positive(),room:z.string().trim().min(1,"Room is required."),name:z.string().trim().optional(),contact:z.string().trim().optional(),category:z.string().trim().min(1,"Category is required."),description:z.string().trim().min(1,"Description is required."),priority:z.enum(["low","normal","high","urgent"])});
const read=(data:FormData)=>complaintSchema.safeParse({source:data.get("source"),blockId:data.get("blockId"),room:data.get("room"),name:data.get("name"),contact:data.get("contact"),category:data.get("category"),description:data.get("description"),priority:data.get("priority")});

export async function createComplaint(data:FormData){await requireRole(["admin"]);const parsed=read(data);if(!parsed.success)redirect(`/admin/complaints/new?error=${encodeURIComponent(parsed.error.issues[0]?.message||"Invalid complaint")}`);const s=await createClient();const {error}=await s.from("complaints").insert({source:parsed.data.source,block_id:parsed.data.blockId,room_no:parsed.data.room,complainant_name:parsed.data.name||null,complainant_contact:parsed.data.contact||null,category:parsed.data.category,description:parsed.data.description,priority:parsed.data.priority});if(error)redirect(`/admin/complaints/new?error=${encodeURIComponent(error.message)}`);revalidatePath("/admin");revalidatePath("/admin/complaints");redirect("/admin/complaints?created=1")}
export async function reviewComplaint(id:string,data:FormData){await requireRole(["admin"]);const parsed=read(data);if(!parsed.success)redirect(`/admin/complaints/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message||"Invalid complaint")}`);const s=await createClient();const {error}=await s.from("complaints").update({source:parsed.data.source,block_id:parsed.data.blockId,room_no:parsed.data.room,complainant_name:parsed.data.name||null,complainant_contact:parsed.data.contact||null,category:parsed.data.category,description:parsed.data.description,priority:parsed.data.priority}).eq("id",id);if(error)redirect(`/admin/complaints/${id}?error=${encodeURIComponent(error.message)}`);revalidatePath(`/admin/complaints/${id}`);redirect(`/admin/complaints/${id}?saved=1`)}
const confirmedDefectSchema = z.object({
  area: z.enum(["Room", "Bathroom", "Common Area"]),
  item: z.string().trim().min(1).max(100),
  issue: z.string().trim().min(1).max(100),
  note: z.string().trim().max(500),
}).superRefine((defect, context) => {
  if ((defect.item === "Other" || defect.issue === "Other") && !defect.note) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["note"], message: "Describe the Other problem." });
  }
});
const confirmedDefectsSchema = z.array(confirmedDefectSchema).min(1).max(10);

export async function assignComplaint(id:string,data:FormData){
  await requireRole(["admin"]);
  const staffId=String(data.get("staffId")||"");
  if(!z.string().uuid().safeParse(staffId).success)
    redirect(`/admin/complaints/${id}?error=Choose%20an%20eligible%20staff%20member.`);
  let incoming: unknown;
  try { incoming = JSON.parse(String(data.get("defects") || "[]")); }
  catch { redirect(`/admin/complaints/${id}?error=Invalid%20defect%20list.`); }
  const parsed = confirmedDefectsSchema.safeParse(incoming);
  if(!parsed.success) redirect(`/admin/complaints/${id}?error=Select%201%20to%2010%20confirmed%20defects.`);
  const s=await createClient();
  const {data:complaint,error:complaintError}=await s.from("complaints").select("source,room_access_permission").eq("id",id).maybeSingle();
  if(complaintError||!complaint)redirect(`/admin/complaints/${id}?error=${encodeURIComponent(complaintError?.message||"Complaint not found")}`);
  const appointment=validateComplaintAppointmentSelection(complaint.source,complaint.room_access_permission,data.get("appointmentDate"),data.get("appointmentTime"));
  if(!appointment.success)redirect(`/admin/complaints/${id}?error=${encodeURIComponent(appointment.error)}`);
  const date=appointment.appointment?.appointmentDate||null;
  const time=appointment.appointment?.appointmentTime||null;
  const remarks=String(data.get("remarks")||"").trim().slice(0,1000)||null;
  const {data:jobs,error}=await s.rpc("assign_complaint_defects",{
    p_complaint_id:id,p_assigned_to:staffId,p_defects:parsed.data,
    p_appointment_date:date,p_appointment_time:time,p_remarks:remarks
  });
  if(error)redirect(`/admin/complaints/${id}?error=${encodeURIComponent(error.message)}`);
  for(const [index,job] of (jobs||[]).entries()) {
    try {
      await createAppNotifications({ recipientIds: [staffId], type: "job_assigned",
        title: "New maintenance job assigned",
        body: `${job.job_no} — ${parsed.data[index]?.item || "room defect"}${date ? `, ${date} ${time || ""}` : ""}`,
        href: `/staff/jobs/${job.job_id}`, entityId: job.job_id });
    } catch (notificationError) { console.error("Unable to notify assigned maintenance staff", notificationError); }
  }
  revalidatePath("/admin");revalidatePath("/admin/complaints");revalidatePath(`/admin/complaints/${id}`);
  revalidatePath("/admin/jobs");revalidatePath("/admin/daily-tasks");revalidatePath("/staff");revalidatePath("/staff/tasks");
  redirect(`/admin/complaints/${id}?assigned=1`);
}
export async function rejectComplaint(id:string){const actor=await requireRole(["admin"]);const s=await createClient();const {error}=await s.from("complaints").update({status:"rejected",reviewed_at:new Date().toISOString(),reviewed_by:actor.id}).eq("id",id).in("status",["new","under_review"]);if(error)redirect(`/admin/complaints/${id}?error=${encodeURIComponent(error.message)}`);revalidatePath("/admin/complaints");redirect("/admin/complaints?rejected=1")}

export async function deleteComplaint(id:string){
  await requireRole(["admin"]);
  const s=await createClient();
  const {data:complaint,error:lookupError}=await s.from("complaints").select("id,status").eq("id",id).maybeSingle();
  if(lookupError||!complaint)redirect("/admin/complaints/"+id+"?error="+encodeURIComponent(lookupError?.message||"Complaint not found."));
  if(!["new","under_review","rejected"].includes(complaint.status))redirect("/admin/complaints/"+id+"?error=Only%20unassigned%20or%20rejected%20complaints%20can%20be%20deleted.");
  const {data:removed,error}=await s.from("complaints").delete().eq("id",id).select("id").maybeSingle();
  if(error)redirect("/admin/complaints/"+id+"?error="+encodeURIComponent(error.message));
  if(!removed)redirect("/admin/complaints/"+id+"?error=This%20complaint%20has%20a%20maintenance%20job%20and%20cannot%20be%20deleted.");
  revalidatePath("/admin");
  revalidatePath("/admin/complaints");
  revalidatePath("/admin/jobs");
  redirect("/admin/complaints?deleted=1");
}

const appointmentSchema=z.object({
  appointmentDate:z.string().date(),appointmentTime:z.enum(appointmentTimeValues),staffId:z.string().uuid(),
  remarks:z.string().trim().max(1000).optional(),
});

export async function createAppointment(complaintId:string,data:FormData){
  const actor=await requireRole(["admin"]);
  const parsed=appointmentSchema.safeParse({appointmentDate:data.get("appointmentDate"),appointmentTime:data.get("appointmentTime"),staffId:data.get("staffId"),remarks:data.get("remarks")});
  if(!parsed.success)redirect(`/admin/complaints/${complaintId}?error=${encodeURIComponent(parsed.error.issues[0]?.message||"Invalid appointment")}`);
  const s=await createClient();
  const {data:job}=await s.from("maintenance_jobs").select("id").eq("complaint_id",complaintId).maybeSingle();
  if(!job)redirect(`/admin/complaints/${complaintId}?error=${encodeURIComponent("Assign staff before creating an appointment.")}`);
  const {error}=await s.from("appointments").insert({complaint_id:complaintId,job_id:job.id,appointment_date:parsed.data.appointmentDate,appointment_time:parsed.data.appointmentTime,assigned_staff:parsed.data.staffId,remarks:parsed.data.remarks||null,status:"pending_confirmation",created_by:actor.id});
  if(error)redirect(`/admin/complaints/${complaintId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin");revalidatePath("/admin/daily-tasks");revalidatePath("/admin/reports");revalidatePath("/staff");revalidatePath("/staff/tasks");revalidatePath(`/admin/complaints/${complaintId}`);
  redirect(`/admin/complaints/${complaintId}?appointment=1`);
}

export async function updateAppointment(complaintId:string,appointmentId:string,data:FormData){
  await requireRole(["admin"]);const status=z.enum(["pending_confirmation","confirmed","completed","cancelled","rescheduled","no_show"]).safeParse(data.get("status"));
  if(!status.success)redirect(`/admin/complaints/${complaintId}?error=Invalid%20appointment%20status`);
  const s=await createClient();const {error}=await s.from("appointments").update({status:status.data}).eq("id",appointmentId).eq("complaint_id",complaintId);
  if(error)redirect(`/admin/complaints/${complaintId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin");revalidatePath("/admin/daily-tasks");revalidatePath("/staff");revalidatePath(`/admin/complaints/${complaintId}`);redirect(`/admin/complaints/${complaintId}?appointment=1`);
}
