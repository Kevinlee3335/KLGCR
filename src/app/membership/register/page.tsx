import { MembershipForm } from "@/components/membership-form";
import { membershipEnabled } from "@/lib/membership";
export default function RegisterPage() {
  return <><p className="eyebrow">JOIN · RENEW · MANAGE</p><h1>Your membership,<br/>made simple.</h1><p className="member-intro">Register with KLG Campus Residence. Submit your details and payment receipt, then our team will verify your application.</p><section className="panel">{membershipEnabled() ? <>{process.env.KLGCR_MEMBERSHIP_PAYMENT_INSTRUCTIONS ? <p className="fee-note" style={{whiteSpace:"pre-line"}}>{process.env.KLGCR_MEMBERSHIP_PAYMENT_INSTRUCTIONS}</p> : <p>Please obtain payment details from the Management Office before submitting your receipt.</p>}<MembershipForm/></> : <p>Registration is being prepared. Please contact the Management Office.</p>}</section></>;
}
