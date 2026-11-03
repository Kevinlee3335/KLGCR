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

export async function submitCommitteeForReview(form:FormData) {
 await requireRole(["admin"]);
 if(!membershipEnabled()) throw new Error("Membership is not enabled.");
 const month=String(form.get("month")||"");
 const base="/admin/members/committee-reports";
 if(!validCommitteeMonth(month)||month>=malaysiaDay().slice(0,7)+"-01") redirect(base+"?error=month");
 const db=createAdminClient();
 const report=await db.from("membership_committee_reports").select("*").eq("month",month).maybeSingle();
 if(report.error||!report.data) redirect(base+"?error=review");
 const result=await db.from("gym_monthly_approvals").upsert({month,kind:"committee",snapshot:report.data},{onConflict:"month,kind",ignoreDuplicates:true});
 if(result.error) {console.error("Committee review submission failed",result.error.code);redirect(base+"?error=review");}
 const review=await db.from("gym_monthly_approvals").select("id").eq("month",month).eq("kind","committee").single();
 if(review.error) redirect(base+"?error=review");
 const {dispatchDocumentReviewPushes}=await import("@/lib/document-review-notifications");
 await dispatchDocumentReviewPushes(review.data.id).catch(error=>console.error("Document phone notification pending retry",error));
 revalidatePath(base);revalidatePath("/admin");
 redirect(base+"?submitted="+month.slice(0,7));
}
