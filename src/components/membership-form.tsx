"use client";
import { useActionState, useState } from "react";
import { SubmitButton } from "./submit-button";
import { registerMember, submitMemberRequest } from "@/app/membership/actions";
export function MembershipForm({ token, period, fee, submissionEnabled = true }: { token?: string; period?: string; fee?: number; submissionEnabled?: boolean }) {
  const [type, setType] = useState("resident");
  const [state, action] = useActionState(token ? submitMemberRequest : registerMember, { error: "" });
  return <form action={action} className="membership-form">
    {state.error && <p className="error wide" role="alert">{state.error}</p>}
    {token ? <><input type="hidden" name="token" value={token}/><input type="hidden" name="period" value={period}/><input type="hidden" name="intent" value="renew"/><p className="fee-note wide">Membership month: <strong>{period?.slice(0, 7)}</strong><br/>Amount payable: <strong>RM{fee ?? 40}</strong>. Your membership is updated after Admin verifies your payment.</p></> : <>
      <label>Member type<select name="member_type" value={type} onChange={event => setType(event.target.value)}><option value="resident">Residence tenant</option><option value="outsider">Outsider</option></select></label>
      <label>Full name<input name="full_name" autoComplete="name" maxLength={200} required/></label>
      <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required/></label>
      <label>Identification type<select name="id_type"><option>IC</option><option>Passport</option></select></label>
      <label>IC / Passport number<input name="identification" maxLength={200} required/></label>
      <label>Gender<select name="gender"><option>Male</option><option>Female</option><option>Other</option></select></label>
      <label>Nationality<input name="nationality" maxLength={200} required/></label>
      <label>Room number<input name="room_no" maxLength={200} required/></label>
      <label>Student ID number<input name="student_id" maxLength={200} required/></label>
      <label>Residential address / unit number<input name="address" autoComplete="street-address" maxLength={200} required/></label>
      <p className="fee-note wide">Monthly membership: <strong>RM40</strong><br/>New member fee: <strong>{type === "outsider" ? "RM10 (outsiders only)" : "RM0"}</strong><br/>Total: <strong>RM{type === "outsider" ? 50 : 40}</strong>. Initial membership covers the current calendar month.</p>
    </>}
    <label className="wide">Payment receipt<input name="receipt" type="file" accept="image/jpeg,image/png,application/pdf" required/><small>JPG, PNG or PDF, up to 3 MB. Payment is verified by Admin.</small></label>
    <label className="wide member-consent"><input type="checkbox" name="consent" value="yes" required/>I confirm my details and payment receipt are accurate. I agree to the use of these details for membership administration.</label>
    <div hidden aria-hidden="true"><input name="website" tabIndex={-1} autoComplete="off"/></div>
    <div className="wide">{submissionEnabled ? <SubmitButton pendingText="Submitting…">{token ? "Submit renewal for verification" : "Submit registration"}</SubmitButton> : <button type="button" className="button" disabled>Registration opens after setup</button>}</div>
  </form>;
}
