import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, validToken, memberStatus, nextPeriod, membershipEnabled, membershipFee, receiptOptionalForTesting } from "@/lib/membership";
import { MembershipForm } from "@/components/membership-form";
import { cancelMembership } from "../../actions";
import { SubmitButton } from "@/components/submit-button";
export default async function ManagePage({ params, searchParams }: { params: Promise<{token:string}>; searchParams: Promise<{submitted?:string;action?:string}> }) {
  const {token} = await params;
  if (!membershipEnabled() || !validToken(token)) notFound();
  const db = createAdminClient();
  const {data: member, error} = await db.from("memberships").select("id,full_name,status,member_type,created_at,expires_on").eq("token_hash", hashToken(token)).maybeSingle();
  if (error) throw new Error("Unable to load membership. Please try again later.");
  if (!member) notFound();
  const {data: payments, error: paymentsError} = await db.from("membership_payments").select("id,period_start,amount,status,review_note,created_at").eq("member_id", member.id).order("created_at", {ascending:false}).limit(24);
  if (paymentsError) throw new Error("Unable to load payment history. Please try again later.");
  const {data: emailStatus} = await db.from("membership_emails").select("status,last_error").eq("member_id",member.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
  const period = nextPeriod(member.expires_on);
  const pending = payments?.some(payment => payment.period_start === period && payment.status !== "rejected");
  const {submitted, action} = await searchParams;
  return <><Link className="membership-back" href="/membership/register">← Membership options</Link><p className="eyebrow">MY MEMBERSHIP</p><h1>Hello, {member.full_name}.</h1><p className="member-status">{memberStatus(member)}</p>{submitted && <p className="success" role="status">Your application has been saved. Please wait for Admin verification.</p>}
    {emailStatus && <p className={emailStatus.status === "sent" ? "success" : "fee-note"} role="status">{emailStatus.status === "sent" ? "Your membership email was sent. Please check your inbox and spam folder." : "Your registration is saved, but your email is still waiting to be sent. Management can retry it from the member list."}</p>}
    <section className="panel"><h2>Membership details</h2><p>Registered: {new Date(member.created_at).toLocaleDateString("en-MY",{timeZone:"Asia/Kuala_Lumpur"})}</p><p>Valid until: <strong>{member.expires_on || "Pending approval"}</strong></p><p className="subtle">Keep this private link safe. Anyone with this link can manage your membership.</p>{<div className="member-qr"><img width="240" height="240" src={`/api/membership/qr?card=${member.id}`} alt="Your membership QR code"/><p>Member reference: {member.id.slice(0,8).toUpperCase()}</p></div>}</section>
    {member.status !== "cancelled" && action !== "cancel" && <section className="panel"><h2>{member.expires_on ? "Renew membership" : "Payment verification"}</h2>{pending ? <p>Your payment for {period.slice(0,7)} is pending verification.</p> : <MembershipForm receiptOptional={receiptOptionalForTesting()} token={token} period={period} fee={membershipFee(member.member_type,!member.expires_on)}/>}</section>}
    <section className="panel"><h2>Payment history</h2>{payments?.length ? payments.map(payment => <div key={payment.id}><p><strong>{payment.period_start.slice(0,7)}</strong> · RM{payment.amount} · {payment.status.replaceAll("_"," ")}</p>{payment.review_note && <p className="subtle">{payment.review_note}</p>}</div>) : <p>No payments submitted.</p>}</section>
    {member.status !== "cancelled" && action !== "renew" && <details className="panel" open={action === "cancel"}><summary>Cancel membership</summary><p>Cancellation ends your membership and adds your card to the list for Management to block. Contact Management for any refund enquiries.</p><form action={cancelMembership}><input type="hidden" name="token" value={token}/><label><input type="checkbox" name="confirm" value="yes" required/> I confirm I want to cancel my membership.</label><p><SubmitButton pendingText="Cancelling…">Confirm cancellation</SubmitButton></p></form></details>}
  </>;
}
