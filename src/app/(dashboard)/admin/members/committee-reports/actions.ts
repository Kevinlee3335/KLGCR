"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { membershipEnabled,malaysiaDay } from "@/lib/membership";
import { validCommitteeMonth } from "@/lib/committee-report";
export async function saveCommitteeReport(form:FormData) {
 const profile=await requireRole(["admin"]);
 if(!membershipEnabled()) throw new Error("Membership is not enabled.");
 const month=String(form.get("month")||"")+"-01";
 const base="/admin/members/committee-reports";
 if(!validCommitteeMonth(month)||month>=malaysiaDay().slice(0,7)+"-01") redirect(base+"?error=month");
 const {error}=await createAdminClient().rpc("save_membership_committee_report",{p_month:month,p_actor:profile.id});
 if(error){console.error("Committee report could not be saved",error.code);redirect(base+"?error=save");}
 revalidatePath(base);
 redirect(base+"?saved="+month.slice(0,7));
}
