"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { membershipEnabled, receiptOptionalForTesting } from "@/lib/membership";
import { deliverMembershipEmails } from "@/lib/membership-email";
export async function reviewPayment(form: FormData) {
 const profile = await requireRole(["admin"]);
 if (!membershipEnabled()) throw new Error("Membership is not enabled.");
 const payment = String(form.get("payment")||"");
 const approve = form.get("decision") === "approve";
 const note = String(form.get("note")||"").trim().slice(0,1000);
 const confirmed = form.get("verified") === "yes";
 if (!/^[a-f0-9-]{36}$/.test(payment)) throw new Error("Invalid payment.");
 if (approve && !confirmed) redirect("/admin/members?error=verify");
 if (!approve && !note) redirect("/admin/members?error=reason");
 if (approve && !receiptOptionalForTesting()) {
  const {data: paymentRecord,error: paymentError} = await createAdminClient().from("membership_payments").select("receipt_path").eq("id",payment).single();
  if (paymentError || !paymentRecord?.receipt_path) redirect("/admin/members?error=review");
 }
 const {error} = await createAdminClient().rpc("review_membership_payment",{p_payment:payment,p_actor:profile.id,p_approve:approve,p_note:note});
 if (error) { console.error("Membership review failed",error); redirect("/admin/members?error=review"); }
 // Approval and email queuing commit atomically. Failed email can be retried without approving twice.
 try {
  const {data: reviewedPayment} = await createAdminClient().from("membership_payments").select("member_id").eq("id",payment).single();
  if (reviewedPayment) await deliverMembershipEmails(reviewedPayment.member_id);
 } catch (error) { console.error("Membership email retry pending",error); }
 revalidatePath("/admin/members");
 redirect("/admin/members?success=reviewed");
}
export async function retryMembershipEmails() {
 await requireRole(["admin"]);
 if (!membershipEnabled()) return;
 await deliverMembershipEmails();
 revalidatePath("/admin/members");
}

export async function reviewMemberRequest(form:FormData) {
 const profile=await requireRole(["admin"]);
 if (!membershipEnabled()) throw new Error("Membership is not enabled.");
 const id=String(form.get("request")||"");
 const approve=form.get("decision")==="approve";
 const note=String(form.get("note")||"").trim().slice(0,1000);
 if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid request.");
 if (approve && form.get("verified")!=="yes") redirect("/admin/members?error=verify");
 if (!approve && !note) redirect("/admin/members?error=reason");
 const db=createAdminClient();
 const {data: req,error: loadError}=await db.from("membership_requests").select("member_id,receipt_path,request_type").eq("id",id).single();
 if (loadError || !req || (approve && !req.member_id) || (approve && req.request_type==="renew" && !req.receipt_path && !receiptOptionalForTesting())) redirect("/admin/members?error=review");
 const {error}=await db.rpc("review_membership_request",{p_request:id,p_actor:profile.id,p_approve:approve,p_note:note});
 if(error) {console.error("Membership request review failed",error);redirect("/admin/members?error=review");}
 if(req.member_id) try{await deliverMembershipEmails(req.member_id);}catch(error){console.error("Membership email remains queued",error);}
 revalidatePath("/admin/members");redirect("/admin/members?success=reviewed");
}
