import { MembershipForm } from "@/components/membership-form";
import { membershipEnabled } from "@/lib/membership";
export default function RegisterPage() {
  return <><p className="eyebrow">JOIN · RENEW · MANAGE</p><h1>Your membership,<br/>made simple.</h1><p className="member-intro">Register with KLG Campus Residence. Submit your details and payment receipt, then our team will verify your application.</p><section className="panel"><>{!membershipEnabled() && <p className="fee-note">Preview only — registration is not open yet. Please do not upload personal documents until registration opens.</p>}{process.env.KLGCR_MEMBERSHIP_PAYMENT_INSTRUCTIONS ? <p className="fee-note" style={{whiteSpace:"pre-line"}}>{process.env.KLGCR_MEMBERSHIP_PAYMENT_INSTRUCTIONS}</p> : <p>Please obtain payment details from the Management Office before submitting your receipt.</p>}<MembershipForm submissionEnabled={membershipEnabled()}/></></section></>;
}
