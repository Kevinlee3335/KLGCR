"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { membershipEnabled } from "@/lib/membership";
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
 const {error} = await createAdminClient().rpc("review_membership_payment",{p_payment:payment,p_actor:profile.id,p_approve:approve,p_note:note});
 if (error) { console.error("Membership review failed",error); redirect("/admin/members?error=review"); }
 // Approval and email queuing commit atomically. Failed email can be retried without approving twice.
 try { await deliverMembershipEmails(); } catch (error) { console.error("Membership email retry pending",error); }
 revalidatePath("/admin/members");
 redirect("/admin/members?success=reviewed");
}
export async function retryMembershipEmails() {
 await requireRole(["admin"]);
 if (!membershipEnabled()) return;
 await deliverMembershipEmails();
 revalidatePath("/admin/members");
}
