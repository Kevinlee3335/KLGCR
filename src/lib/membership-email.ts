import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/email";
import { appOrigin, escapeHtml, memberLink } from "@/lib/membership";
import { openToken } from "@/lib/membership-secrets";

/** Durable email queue. Concurrent workers claim each row once; failed deliveries remain retryable. */
export async function deliverMembershipEmails(memberId?: string) {
  const db = createAdminClient();
  let query = db.from("membership_emails").select("id,member_id,kind,period_start,attempts").eq("status","pending").order("created_at").limit(500);
  if (memberId) query = query.eq("member_id",memberId);
  const {data: queue,error} = await query;
  if (error) throw new Error("Unable to load membership email queue.");
  let sent = 0;
  async function deliver(item: NonNullable<typeof queue>[number]) {
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
      const link = memberLink(openToken(member.token_ciphertext));
      const registered = item.kind === "approved";
      const subject = registered ? "Membership confirmed – KLG Campus Residence" : "Membership renewal reminder – KLG Campus Residence";
      const body = registered ? `Your registration / renewal has been approved. Membership is valid until ${member.expires_on}.` : `Please renew your membership for ${item.period_start.slice(0,7)}. If you do not renew, your access card will be listed for blocking on ${item.period_start}. If you have submitted a receipt, it may still be pending Admin verification.`;
      const text = `Dear ${member.full_name},\n\n${body}\n\nRenew or cancel membership: ${link}\nRegister: ${appOrigin()}/membership/register\n\nKLG Campus Residence Management`;
      const html = `<p>Dear ${escapeHtml(member.full_name)},</p><p>${escapeHtml(body)}</p><p><a href="${link}">Renew / manage membership</a></p><p><a href="${appOrigin()}/membership/register">Registration link</a></p>${registered ? `<p>Your membership QR code:</p><img width="240" height="240" src="${appOrigin()}/api/membership/qr?card=${member.id}" alt="Membership QR code"/><p><a href="${appOrigin()}/membership/card/${member.id}">View membership card</a></p>` : ""}<p>KLG Campus Residence Management</p>`;
      const result = await sendTransactionalEmail(member.email,{subject,text,html});
      if (!result.sent) throw new Error(result.reason);
      const {error:sentError} = await db.from("membership_emails").update({status:"sent",sent_at:new Date().toISOString(),last_error:null}).eq("id",item.id);
      if (sentError) throw new Error("Email delivered but delivery status could not be saved.");
      sent++;
    } catch (error) {
      const {error:retryError} = await db.from("membership_emails").update({status:"pending",last_error:error instanceof Error ? error.message : "Delivery failed"}).eq("id",item.id);
      if (retryError) console.error("Unable to release membership email",item.id);
    }
  }
  const items = queue || [];
  for (let index = 0; index < items.length; index += 10) {
    await Promise.all(items.slice(index, index + 10).map(deliver));
  }
  return sent;
}
