import Link from "next/link";
import { redirect } from "next/navigation";
import { UserPlus, RefreshCw, CircleX, ArrowRight } from "lucide-react";
import { MembershipForm } from "@/components/membership-form";
import { membershipEnabled, receiptOptionalForTesting } from "@/lib/membership";
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ action?: string; error?: string }> }) {
  const query = await searchParams;
  const intent = query.action === "renew" || query.action === "cancel" ? query.action : null;
  async function openMembership(form: FormData) {
    "use server";
    const choice = form.get("intent") === "cancel" ? "cancel" : "renew";
    const value = String(form.get("membership_link") || "").trim();
    const token = /^[a-f0-9]{64}$/.test(value) ? value : value.match(/\/membership\/manage\/([a-f0-9]{64})(?:[/?#]|$)/)?.[1];
    if (!token) redirect(`/membership/register?action=${choice}&error=Please+paste+the+private+membership+link+from+your+email`);
    redirect(`/membership/manage/${token}?action=${choice}`);
  }
  if (query.action !== "new") return <>
    <p className="eyebrow">JOIN · RENEW · MANAGE</p><h1>Your membership,<br/>made simple.</h1>
    <p className="member-intro">What would you like to do today?</p>
    <nav className="membership-choices" aria-label="Membership services">
      <Link className="membership-choice" href="/membership/register?action=new"><span className="choice-icon"><UserPlus size={26}/></span><div><h2>New Registration</h2><p>Join as a new member.</p></div><ArrowRight size={20}/></Link>
      <Link className={`membership-choice${intent === "renew" ? " selected" : ""}`} href="/membership/register?action=renew" aria-current={intent === "renew" ? "page" : undefined}><span className="choice-icon"><RefreshCw size={26}/></span><div><h2>Renew Membership</h2><p>Continue your existing membership.</p></div><ArrowRight size={20}/></Link>
      <Link className={`membership-choice${intent === "cancel" ? " selected" : ""}`} href="/membership/register?action=cancel" aria-current={intent === "cancel" ? "page" : undefined}><span className="choice-icon"><CircleX size={26}/></span><div><h2>Cancel Membership</h2><p>Manage your membership cancellation.</p></div><ArrowRight size={20}/></Link>
    </nav>
    {intent && <section className="panel"><h2>{intent === "renew" ? "Renew Membership" : "Cancel Membership"}</h2><p className="member-intro">Paste the private membership link from your registration email to securely access your membership. If you cannot find it, contact the Management Office.</p>{query.error && <p className="error" role="alert">{query.error}</p>}<form action={openMembership} className="membership-form"><input type="hidden" name="intent" value={intent}/><label className="wide">Your private membership link<input type="text" name="membership_link" placeholder="Paste your membership link" autoComplete="off" required/></label><button className="button wide" type="submit">{intent === "renew" ? "Continue to Renewal" : "Continue to Cancellation"}</button></form></section>}
  </>;

  return <><Link className="membership-back" href="/membership/register">← Membership options</Link><p className="eyebrow">JOIN · RENEW · MANAGE</p><h1>Your membership,<br/>made simple.</h1><p className="member-intro">Register with KLG Campus Residence. Submit your details and payment receipt, then our team will verify your application.</p><section className="panel"><>{!membershipEnabled() && <p className="fee-note">Test mode — complete the form and press Test registration to check it. Test entries are not saved and no email is sent. Please use sample details.</p>}{process.env.KLGCR_MEMBERSHIP_PAYMENT_INSTRUCTIONS ? <p className="fee-note" style={{whiteSpace:"pre-line"}}>{process.env.KLGCR_MEMBERSHIP_PAYMENT_INSTRUCTIONS}</p> : <p>Please obtain payment details from the Management Office before submitting your receipt.</p>}<MembershipForm submissionEnabled={membershipEnabled()} receiptOptional={receiptOptionalForTesting()}/></></section></>;
}
