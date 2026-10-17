import { MEMBERSHIP_DECLARATION_CLAUSES } from "@/lib/membership-declaration";
export function MembershipDeclaration() {
 return <section className="wide membership-declaration" aria-labelledby="membership-rules-heading"><p className="eyebrow">PLEASE READ BEFORE REGISTERING</p><h3 id="membership-rules-heading">Sports Club Membership Declaration</h3><ol type="a">{MEMBERSHIP_DECLARATION_CLAUSES.map(clause=><li key={clause}>{clause}</li>)}</ol><label className="member-consent"><input type="checkbox" name="rules_consent" value="yes" required/>I have read, understood and agree to all four clauses (a–d) above.</label></section>;
}
