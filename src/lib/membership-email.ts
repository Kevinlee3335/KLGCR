import { createAdminClient } from "@/lib/supabase/admin";
import { COMMON_EMAIL_FOOTER, sendTransactionalEmail } from "@/lib/email";
import { appOrigin, escapeHtml, memberLink } from "@/lib/membership";
import { openToken } from "@/lib/membership-secrets";

/** Durable email queue. Concurrent workers claim each row once; failed deliveries remain retryable. */
export async function deliverMembershipEmails(memberId?: string) {
  const db = createAdminClient();
  let sent = 0;
  const deadline = Date.now() + 240_000;
  type QueuedEmail = {id:string;member_id:string;kind:string;period_start:string;payment_id:string|null;attempts:number};
  async function deliver(item: QueuedEmail) {
    const {data: claim,error: claimError} = await db.from("membership_emails").update({status:"sending",claimed_at:new Date().toISOString(),attempts:item.attempts+1}).eq("id",item.id).eq("status","pending").select("id").maybeSingle();
    if (claimError) throw new Error("Unable to claim membership email.");
    if (!claim) return;
    try {
      const {data: member,error: memberError} = await db.from("memberships").select("id,full_name,email,status,expires_on,token_ciphertext").eq("id",item.member_id).single();
      if (memberError || !member) throw new Error("Unable to load email recipient.");
      if (item.kind === "registered" || (member.status === "cancelled" && item.kind !== "cancelled") || (item.kind === "reminder" && member.expires_on && member.expires_on >= item.period_start)) {
        const {error:skipError} = await db.from("membership_emails").update({status:"skipped"}).eq("id",item.id);
        if (skipError) throw new Error("Unable to record skipped email.");
        return;
      }
      const cancelled = item.kind === "cancelled";
      const approved = item.kind === "approved";
      let newRegistration = false;
      if (approved) {
        if (!item.payment_id) throw new Error("Approval email has no payment reference.");
        const {data: payment,error: paymentError} = await db.from("membership_payments").select("kind,status").eq("id",item.payment_id).eq("member_id",member.id).single();
        if (paymentError || payment?.status !== "approved") throw new Error("Payment approval must be verified before email delivery.");
        newRegistration = payment.kind === "registration";
      }
      if (cancelled && member.status !== "cancelled") throw new Error("Cancellation must be approved before email delivery.");
      const subject = cancelled ? "Membership cancellation approved – KLG Campus Residence" : approved ? newRegistration ? "Membership registration approved – KLG Campus Residence" : "Membership renewal approved – KLG Campus Residence" : "Membership renewal reminder – KLG Campus Residence";
      const body = cancelled ? "Your membership cancellation request has been approved. Your membership has been cancelled." : approved ? newRegistration ? `Your membership application has been approved. Membership is valid until ${member.expires_on}. Your access card will be activated within 48 hours after your membership application is approved.` : `Your membership renewal has been approved. Membership is valid until ${member.expires_on}.` : `Please renew your membership for ${item.period_start.slice(0,7)}. If you do not renew, your access card will be listed for blocking on ${item.period_start}. If you have submitted a receipt, it may still be pending Admin verification.`;
      const link = cancelled ? "" : memberLink(await openToken(member.token_ciphertext));
      const linksText = cancelled ? "" : `Renew or cancel membership: ${link}\nRegister: ${appOrigin()}/membership/register\n${approved ? `Membership card: ${appOrigin()}/membership/card/${member.id}\n` : ""}`;
      const text = `Dear ${member.full_name},\n\n${body}\n\n${linksText}\n${COMMON_EMAIL_FOOTER}`;
      const html = `<p>Dear ${escapeHtml(member.full_name)},</p><p>${escapeHtml(body)}</p>${cancelled ? "" : `<p><a href="${link}">Renew / manage membership</a></p><p><a href="${appOrigin()}/membership/register">Registration link</a></p>`}${approved ? `<p>Your membership QR code:</p><img width="240" height="240" src="${appOrigin()}/api/membership/qr?card=${member.id}" alt="Membership QR code"/><p><a href="${appOrigin()}/membership/card/${member.id}">View membership card</a></p>` : ""}<p>${escapeHtml(COMMON_EMAIL_FOOTER).replace(/\n/g, "<br/>")}</p>`;
      const result = await sendTransactionalEmail(member.email,{subject,text,html},{timeoutMs:20_000});
      if (!result.sent) throw new Error(result.reason);
      const {error:sentError} = await db.from("membership_emails").update({status:"sent",sent_at:new Date().toISOString(),last_error:null}).eq("id",item.id);
      if (sentError) throw new Error("Email delivered but delivery status could not be saved.");
      sent++;
    } catch (error) {
      const {error:retryError} = await db.from("membership_emails").update({status:"pending",last_error:error instanceof Error ? error.message : "Delivery failed"}).eq("id",item.id);
      if (retryError) console.error("Unable to release membership email",item.id);
    }
  }
  let cursor: string | null = null;
  while (Date.now() < deadline) {
    let query = db.from("membership_emails").select("id,member_id,kind,period_start,payment_id,attempts").eq("status","pending").order("id").limit(500);
    if (memberId) query = query.eq("member_id",memberId);
    if (cursor) query = query.gt("id",cursor);
    const {data: queue,error} = await query;
    if (error) throw new Error("Unable to load membership email queue.");
    if (!queue?.length) break;
    for (let index = 0; index < queue.length && Date.now() < deadline; index += 20) {
      const batch = queue.slice(index, index + 20);
      await Promise.all(batch.map(deliver));
      cursor = batch[batch.length - 1].id;
    }
    if (queue.length < 500) break;
  }
  return sent;
}
