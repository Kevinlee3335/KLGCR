import Link from "next/link";
import { UserPlus, RefreshCw, CircleX, ArrowRight } from "lucide-react";
import { MembershipServiceForm } from "@/components/membership-service-form";
import { MembershipForm } from "@/components/membership-form";
import { COMMON_EMAIL_FOOTER } from "@/lib/email";
import { membershipEnabled, receiptOptionalForTesting, membershipEmailConfigured } from "@/lib/membership";
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ action?: string; error?: string }> }) {
  const query = await searchParams;
  const intent = query.action === "renew" || query.action === "cancel" ? query.action : null;
  if (query.action !== "new") return <>
    <p className="eyebrow">JOIN · RENEW · MANAGE</p><h1>Your membership,<br/>made simple.</h1>
    <p className="member-intro">What would you like to do today?</p>
    <nav className="membership-choices" aria-label="Membership services">
      <Link className="membership-choice" href="/membership/register?action=new"><span className="choice-icon"><UserPlus size={26}/></span><div><h2>New Registration</h2><p>Join as a new member.</p></div><ArrowRight size={20}/></Link>
      <Link className={`membership-choice${intent === "renew" ? " selected" : ""}`} href="/membership/register?action=renew" aria-current={intent === "renew" ? "page" : undefined}><span className="choice-icon"><RefreshCw size={26}/></span><div><h2>Renew Membership</h2><p>Continue your existing membership.</p></div><ArrowRight size={20}/></Link>
      <Link className={`membership-choice${intent === "cancel" ? " selected" : ""}`} href="/membership/register?action=cancel" aria-current={intent === "cancel" ? "page" : undefined}><span className="choice-icon"><CircleX size={26}/></span><div><h2>Cancel Membership</h2><p>Manage your membership cancellation.</p></div><ArrowRight size={20}/></Link>
    </nav>
    {intent && <section className="panel"><h2>{intent === "renew" ? "Renew Membership" : "Cancel Membership"}</h2><p className="member-intro">Enter your name and room number. Management will verify your request.</p><MembershipServiceForm key={intent} intent={intent} receiptOptional={receiptOptionalForTesting()}/></section>}

  </>;

  return <><Link className="membership-back" href="/membership/register">← Membership options</Link><p className="eyebrow">JOIN · RENEW · MANAGE</p><h1>Your membership,<br/>made simple.</h1><p className="member-intro">Register with KLG Campus Residence. Submit your details and payment receipt, then our team will verify your application.</p><section className="panel"><>{membershipEnabled() && <p className="fee-note">Registration is open for testing. Submitted details will be saved. Please use an email address you can check.</p>}{membershipEnabled() && !membershipEmailConfigured() && <p className="fee-note">Email delivery is not configured yet. Your application can be saved, and its confirmation email will remain queued for Management to send.</p>}{!membershipEnabled() && <p className="fee-note">Test mode — complete the form and press Test registration to check it. Test entries are not saved and no email is sent. Please use sample details.</p>}{process.env.KLGCR_MEMBERSHIP_PAYMENT_INSTRUCTIONS ? <p className="fee-note" style={{whiteSpace:"pre-line"}}>{process.env.KLGCR_MEMBERSHIP_PAYMENT_INSTRUCTIONS}</p> : null}<p className="fee-note">Your access card will be activated within 48 hours after your membership application is approved. You will receive a confirmation email once approved.</p><p className="fee-note" style={{whiteSpace:"pre-line"}}>{COMMON_EMAIL_FOOTER}</p><MembershipForm submissionEnabled={membershipEnabled()} receiptOptional={receiptOptionalForTesting()}/></></section></>;
}
