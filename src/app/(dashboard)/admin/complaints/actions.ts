"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { appointmentRequired, appointmentTimeValues } from "@/lib/appointments";

const complaintSchema=z.object({source:z.enum(["google_form","manual","cleaning","flex","other"]),blockId:z.coerce.number().int().positive(),room:z.string().trim().min(1,"Room is required."),name:z.string().trim().optional(),contact:z.string().trim().optional(),category:z.string().trim().min(1,"Category is required."),description:z.string().trim().min(1,"Description is required."),priority:z.enum(["low","normal","high","urgent"])});
const read=(data:FormData)=>complaintSchema.safeParse({source:data.get("source"),blockId:data.get("blockId"),room:data.get("room"),name:data.get("name"),contact:data.get("contact"),category:data.get("category"),description:data.get("description"),priority:data.get("priority")});

export async function createComplaint(data:FormData){await requireRole(["admin"]);const parsed=read(data);if(!parsed.success)redirect(`/admin/complaints/new?error=${encodeURIComponent(parsed.error.issues[0]?.message||"Invalid complaint")}`);const s=await createClient();const {error}=await s.from("complaints").insert({source:parsed.data.source,block_id:parsed.data.blockId,room_no:parsed.data.room,complainant_name:parsed.data.name||null,complainant_contact:parsed.data.contact||null,category:parsed.data.category,description:parsed.data.description,priority:parsed.data.priority});if(error)redirect(`/admin/complaints/new?error=${encodeURIComponent(error.message)}`);revalidatePath("/admin");revalidatePath("/admin/complaints");redirect("/admin/complaints?created=1")}
export async function reviewComplaint(id:string,data:FormData){await requireRole(["admin"]);const parsed=read(data);if(!parsed.success)redirect(`/admin/complaints/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message||"Invalid complaint")}`);const s=await createClient();const {error}=await s.from("complaints").update({source:parsed.data.source,block_id:parsed.data.blockId,room_no:parsed.data.room,complainant_name:parsed.data.name||null,complainant_contact:parsed.data.contact||null,category:parsed.data.category,description:parsed.data.description,priority:parsed.data.priority,status:"under_review"}).eq("id",id);if(error)redirect(`/admin/complaints/${id}?error=${encodeURIComponent(error.message)}`);revalidatePath(`/admin/complaints/${id}`);redirect(`/admin/complaints/${id}?saved=1`)}
export async function assignComplaint(id:string,data:FormData){
  const actor=await requireRole(["admin"]);const staffId=String(data.get("staffId")||"");
  if(!staffId)redirect(`/admin/complaints/${id}?error=Choose%20an%20eligible%20staff%20member.`);
  const s=await createClient();
  const {data:complaint,error:complaintError}=await s.from("complaints").select("room_access_permission").eq("id",id).maybeSingle();
  if(complaintError||!complaint)redirect(`/admin/complaints/${id}?error=${encodeURIComponent(complaintError?.message||"Complaint not found.")}`);
  const needsAppointment=appointmentRequired(complaint.room_access_permission);
  const appointment=needsAppointment?appointmentSchema.safeParse({appointmentDate:data.get("appointmentDate"),appointmentTime:data.get("appointmentTime"),staffId,remarks:""}):null;
  if(appointment&&!appointment.success)redirect(`/admin/complaints/${id}?error=${encodeURIComponent("Select a Maintenance Date and Maintenance Time before approving the job.")}`);
  const {error}=await s.rpc("assign_complaint",{p_complaint_id:id,p_assigned_to:staffId});if(error)redirect(`/admin/complaints/${id}?error=${encodeURIComponent(error.message)}`);
  if(appointment?.success){
    const {data:job,error:jobError}=await s.from("maintenance_jobs").select("id").eq("complaint_id",id).maybeSingle();
    if(jobError||!job)redirect(`/admin/complaints/${id}?error=${encodeURIComponent(jobError?.message||"Job was created but could not be found to schedule its appointment.")}`);
    const {error:appointmentError}=await s.from("appointments").insert({complaint_id:id,job_id:job.id,appointment_date:appointment.data.appointmentDate,appointment_time:appointment.data.appointmentTime,assigned_staff:staffId,remarks:null,status:"pending_confirmation",created_by:actor.id});
    if(appointmentError)redirect(`/admin/complaints/${id}?error=${encodeURIComponent(appointmentError.message)}`);
  }
  revalidatePath("/admin");revalidatePath("/admin/complaints");revalidatePath("/admin/jobs");revalidatePath("/admin/daily-tasks");revalidatePath("/staff");revalidatePath("/staff/tasks");redirect("/admin/jobs?assigned=1")
}
export async function rejectComplaint(id:string){const actor=await requireRole(["admin"]);const s=await createClient();const {error}=await s.from("complaints").update({status:"rejected",reviewed_at:new Date().toISOString(),reviewed_by:actor.id}).eq("id",id).in("status",["new","under_review"]);if(error)redirect(`/admin/complaints/${id}?error=${encodeURIComponent(error.message)}`);revalidatePath("/admin/complaints");redirect("/admin/complaints?rejected=1")}

const appointmentSchema=z.object({
  appointmentDate:z.string().date(),appointmentTime:z.enum(appointmentTimeValues),staffId:z.string().uuid(),
  remarks:z.string().trim().max(1000).optional(),
});

export async function createAppointment(complaintId:string,data:FormData){
  const actor=await requireRole(["admin"]);
  const parsed=appointmentSchema.safeParse({appointmentDate:data.get("appointmentDate"),appointmentTime:data.get("appointmentTime"),staffId:data.get("staffId"),remarks:data.get("remarks")});
  if(!parsed.success)redirect(`/admin/complaints/${complaintId}?error=${encodeURIComponent(parsed.error.issues[0]?.message||"Invalid appointment")}`);
  const s=await createClient();
  const {data:complaint}=await s.from("complaints").select("room_access_permission").eq("id",complaintId).maybeSingle();
  if(!appointmentRequired(complaint?.room_access_permission))redirect(`/admin/complaints/${complaintId}?error=${encodeURIComponent("Appointment is not allowed when room access is granted.")}`);
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
