import { createAdminClient } from "@/lib/supabase/admin";
import { COMMON_EMAIL_FOOTER, sendTransactionalEmail } from "@/lib/email";
import { appOrigin, escapeHtml, memberLink } from "@/lib/membership";
import { openToken } from "@/lib/membership-secrets";

/** Durable email queue. Concurrent workers claim each row once; failed deliveries remain retryable. */
export async function deliverMembershipEmails(memberId?: string) {
  const db = createAdminClient();
  let sent = 0;
  const deadline = Date.now() + 240_000;
  type QueuedEmail = {id:string;member_id:string;kind:string;period_start:string;attempts:number};
  async function deliver(item: QueuedEmail) {
    const {data: claim,error: claimError} = await db.from("membership_emails").update({status:"sending",claimed_at:new Date().toISOString(),attempts:item.attempts+1}).eq("id",item.id).eq("status","pending").select("id").maybeSingle();
    if (claimError) throw new Error("Unable to claim membership email.");
    if (!claim) return;
    try {
      const {data: member,error: memberError} = await db.from("memberships").select("id,full_name,email,status,expires_on,token_ciphertext").eq("id",item.member_id).single();
      if (memberError || !member) throw new Error("Unable to load email recipient.");
      if (member.status === "cancelled" || (item.kind === "reminder" && member.expires_on && member.expires_on >= item.period_start)) {
        const {error:skipError} = await db.from("membership_emails").update({status:"skipped"}).eq("id",item.id);
        if (skipError) throw new Error("Unable to record skipped email.");
        return;
      }
      const link = memberLink(await openToken(member.token_ciphertext));
      const registered = item.kind !== "reminder";
      const subject = item.kind === "registered" ? "Registration received – KLG Campus Residence" : registered ? "Membership confirmed – KLG Campus Residence" : "Membership renewal reminder – KLG Campus Residence";
      const body = item.kind === "registered" ? "Your membership registration has been saved. It is pending Admin verification and your access is not active yet. Keep the private link below to renew or cancel your membership." : registered ? `Your registration / renewal has been approved. Membership is valid until ${member.expires_on}. Your access card will be activated within 48 hours after your new membership application is approved.` : `Please renew your membership for ${item.period_start.slice(0,7)}. If you do not renew, your access card will be listed for blocking on ${item.period_start}. If you have submitted a receipt, it may still be pending Admin verification.`;
      const text = `Dear ${member.full_name},\n\n${body}\n\nRenew or cancel membership: ${link}\nRegister: ${appOrigin()}/membership/register\n${registered ? `Membership card: ${appOrigin()}/membership/card/${member.id}\n` : ""}\n${COMMON_EMAIL_FOOTER}`;
      const html = `<p>Dear ${escapeHtml(member.full_name)},</p><p>${escapeHtml(body)}</p><p><a href="${link}">Renew / manage membership</a></p><p><a href="${appOrigin()}/membership/register">Registration link</a></p>${registered ? `<p>Your membership QR code:</p><img width="240" height="240" src="${appOrigin()}/api/membership/qr?card=${member.id}" alt="Membership QR code"/><p><a href="${appOrigin()}/membership/card/${member.id}">View membership card</a></p>` : ""}<p>${escapeHtml(COMMON_EMAIL_FOOTER).replace(/\n/g, "<br/>")}</p>`;
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
    let query = db.from("membership_emails").select("id,member_id,kind,period_start,attempts").eq("status","pending").order("id").limit(500);
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
