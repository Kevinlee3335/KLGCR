"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { membershipEnabled, receiptOptionalForTesting } from "@/lib/membership";
import { deliverMembershipEmails } from "@/lib/membership-email";

async function receiptAvailable(db: ReturnType<typeof createAdminClient>, path: string) {
 const {data, error} = await db.storage.from("membership-receipts").exists(path);
 return !error && data;
}

export async function reviewPayment(form: FormData) {
 const profile = await requireRole(["admin"]);
 if (!membershipEnabled()) throw new Error("Membership is not enabled.");
 const payment = String(form.get("payment")||"");
 const approve = form.get("decision") === "approve";
 const note = String(form.get("note")||"").trim().slice(0,1000);
 const memberNumber = String(form.get("member_number")||"").trim();
 if (approve && memberNumber.length > 50) redirect("/admin/members?error=member_number");
 const confirmed = form.get("verified") === "yes";
 if (!/^[a-f0-9-]{36}$/.test(payment)) throw new Error("Invalid payment.");
 if (approve && !confirmed) redirect("/admin/members?error=verify");
 if (!approve && !note) redirect("/admin/members?error=reason");
 const db = createAdminClient();
 if (approve) {
  const {data: paymentRecord,error: paymentError} = await db.from("membership_payments").select("receipt_path").eq("id",payment).single();
  if (paymentError || !paymentRecord) redirect("/admin/members?error=review");
  const path = paymentRecord.receipt_path;
  if (path ? !await receiptAvailable(db, path) : !receiptOptionalForTesting()) redirect("/admin/members?error=review");
 }
 const {error} = await db.rpc("review_membership_payment_with_number",{p_payment:payment,p_actor:profile.id,p_approve:approve,p_note:note,p_member_number:memberNumber});
 if (error) { console.error("Membership review failed",error); redirect(error.code === "23505" || error.message?.includes("Member number") ? "/admin/members?error=member_number" : "/admin/members?error=review"); }
 // Approval and email queuing commit atomically. Failed email can be retried without approving twice.
 try {
  const {data: reviewedPayment} = await db.from("membership_payments").select("member_id").eq("id",payment).single();
  if (reviewedPayment) await deliverMembershipEmails(reviewedPayment.member_id);
 } catch (error) { console.error("Membership email retry pending",error); }
 revalidatePath("/admin/members");
 revalidatePath("/admin/members/payment-list");
 redirect("/admin/members?success=reviewed");
}
export async function retryMembershipEmails() {
 await requireRole(["admin"]);
 if (!membershipEnabled()) return;
 await deliverMembershipEmails();
 revalidatePath("/admin/members");
 revalidatePath("/admin/members/payment-list");
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
 if (loadError || !req || (approve && !req.member_id)) redirect("/admin/members?error=review");
 if (approve && req.request_type==="renew" && !receiptOptionalForTesting()) {
  if (!req.receipt_path || !await receiptAvailable(db, req.receipt_path)) redirect("/admin/members?error=review");
 }
 const {error}=await db.rpc("review_membership_request",{p_request:id,p_actor:profile.id,p_approve:approve,p_note:note});
 if(error) {console.error("Membership request review failed",error);redirect("/admin/members?error=review");}
 if(req.member_id) try{await deliverMembershipEmails(req.member_id);}catch(error){console.error("Membership email remains queued",error);}
 revalidatePath("/admin/members");
 revalidatePath("/admin/members/payment-list");redirect("/admin/members?success=reviewed");
}

export async function updateMemberStatus(form:FormData) {
 const profile=await requireRole(["admin"]);
 if(!membershipEnabled()) throw new Error("Membership is not enabled.");
 const id=String(form.get("member")||"");
 if(!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid member.");
 const location=`/admin/members?id=${id}`;
 const status=String(form.get("status")||"");
 const note=String(form.get("note")||"").trim();
 if(!["active","suspended","cancelled"].includes(status)||!note||note.length>1000||form.get("confirmed")!=="yes") redirect(location+"&error=status");
 const {error}=await createAdminClient().rpc("set_membership_status",{p_member:id,p_actor:profile.id,p_status:status,p_expected:String(form.get("expected")||""),p_note:note});
 if(error) redirect(location+"&error=status");
 revalidatePath("/admin/members");
 revalidatePath("/admin/members/payment-list");
 redirect(location+"&success=status");
}

export async function replaceMemberPhoto(form: FormData) {
 const profile = await requireRole(["admin"]);
 if (!membershipEnabled()) throw new Error("Membership is not enabled.");
 const id = String(form.get("member") || "");
 if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid member.");
 const location = `/admin/members?id=${id}`;
 const kind = String(form.get("kind") || "");
 if (kind !== "personal" && kind !== "card") redirect(location + "&error=photo");
 const file = form.get(kind === "card" ? "access_card" : "personal_photo");
 if (!(file instanceof File) || !file.size || file.size > 1024 * 1024) redirect(location + "&error=photo");
 const bytes = Buffer.from(await file.arrayBuffer());
 if (file.type !== "image/jpeg" || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) redirect(location + "&error=photo");
 const db = createAdminClient();
 const {data: member, error: loadError} = await db.from("memberships").select("photo_path,access_card_path").eq("id",id).maybeSingle();
 if (loadError || !member) redirect(location + "&error=photo");
 const field = kind === "card" ? "access_card_path" : "photo_path";
 const previous = member[field];
 const path = `${id}/${crypto.randomUUID()}.jpg`;
 const {error: uploadError} = await db.storage.from("membership-photos").upload(path,bytes,{contentType:"image/jpeg",upsert:false});
 if (uploadError) redirect(location + "&error=photo");
 let update = db.from("memberships").update({[field]:path}).eq("id",id);
 update = previous ? update.eq(field,previous) : update.is(field,null);
 const {data: saved, error: updateError} = await update.select("id").maybeSingle();
 if (updateError || !saved) {
  await db.storage.from("membership-photos").remove([path]);
  redirect(location + "&error=photo");
 }
 const {error: auditError} = await db.from("membership_activity").insert({member_id:id,actor_id:profile.id,event:kind === "card" ? "access_card_photo_replaced" : "personal_photo_replaced",details:{}});
 if (auditError) console.error("Unable to record membership photo replacement",auditError);
 revalidatePath("/admin/members");
 redirect(location + "&success=photo");
}
