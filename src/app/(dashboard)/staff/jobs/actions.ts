"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
export async function startJob(id:string){await requireRole(["maintenance_staff"]);const s=await createClient();const {error}=await s.rpc("start_assigned_job",{p_job_id:id});if(error)redirect(`/staff/jobs/${id}?error=${encodeURIComponent(error.message)}`);revalidatePath("/staff");revalidatePath(`/staff/jobs/${id}`);redirect(`/staff/jobs/${id}?started=1`)}
