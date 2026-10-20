"use client";
import { UploadCloud, FileCheck2, CheckCircle2 } from "lucide-react";
import { useActionState, useState, useId } from "react";
import { MembershipCountrySelect } from "./membership-country-select";
import { MembershipDeclaration } from "./membership-declaration";
import { MembershipPhoto } from "./membership-photo";
import { MembershipPayment } from "./membership-payment";
import { SubmitButton } from "./submit-button";
import { registerMember, submitMemberRequest } from "@/app/membership/actions";
export function MembershipForm({ token, period, fee, submissionEnabled = true, receiptOptional = false }: { token?: string; period?: string; fee?: number; submissionEnabled?: boolean; receiptOptional?: boolean }) {
  const receiptId = useId();
  const [fileName, setFileName] = useState("");
  const [receiptError, setReceiptError] = useState("");
  const [previewResult, setPreviewResult] = useState<{name:string;location:string;amount:number}|null>(null);
  const [idType, setIdType] = useState("IC");
  const [passportNationality, setPassportNationality] = useState("");
  const [type, setType] = useState("resident");
  const [state, action] = useActionState(token ? submitMemberRequest : registerMember, { error: "" });
  return <form action={action} className="membership-form" onSubmit={event => {
    if (submissionEnabled) return;
    event.preventDefault();
    if (receiptError) return;
    const values = new FormData(event.currentTarget);
    setPreviewResult({name:String(values.get("full_name")||"Member"),location:String(values.get("room_no")||""),amount:40});
  }}>
    {state.error && <p className="error wide" role="alert">{state.error}</p>}
    {token ? <><input type="hidden" name="token" value={token}/><input type="hidden" name="period" value={period}/><input type="hidden" name="intent" value="renew"/><p className="fee-note wide">Membership month: <strong>{period?.slice(0, 7)}</strong><br/>Amount payable: <strong>RM{fee ?? 40}</strong>. Your membership is updated after Admin verifies your payment.</p></> : <>
      <label>Member type<select name="member_type" value={type} onChange={event => setType(event.target.value)}><option value="resident">Residence tenant</option><option value="outsider">Non Residence</option></select></label>
      <label>Full name<input name="full_name" autoComplete="name" maxLength={200} required/></label>
      <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required/></label>
      <label>Identification type<select name="id_type" value={idType} onChange={event=>setIdType(event.target.value)}><option>IC</option><option>Passport</option></select></label>
      <label>IC / Passport number<input name="identification" maxLength={200} required/></label>
      <label>Gender<select name="gender"><option>Male</option><option>Female</option><option>Other</option></select></label>
      <MembershipCountrySelect locked={idType==="IC"} value={passportNationality} onChange={setPassportNationality}/>
      <label>Address<input name="room_no" autoComplete="street-address" maxLength={200} required/></label>
      <label>Emergency contact number<input name="emergency_contact" type="tel" inputMode="tel" maxLength={40} required/></label>
      <label>Relationship<select name="emergency_relationship" defaultValue="" required><option value="" disabled>Select relationship</option><option>Spouse</option><option>Father</option><option>Mother</option><option>Sibling</option><option>Guardian</option><option>Friend</option><option>Other</option></select></label>
      <label>Student ID number<input name="student_id" maxLength={200} required/></label>
      <MembershipPhoto/>
      <p className="fee-note wide">Monthly membership: <strong>RM40</strong><br/>Online payment: <strong>RM40</strong>{type === "outsider" && <><br/>Access Card Deposit: <strong>RM10 — pay cash at the Management Office</strong><br/>The deposit is separate from your online membership payment.</>}<br/>Initial membership covers the current calendar month.</p>
    </>}
    <p className="fee-note wide">Payment receipts are reviewed manually by Admin. Your application is approved only after Admin confirms your payment.</p>
    <MembershipPayment amount={token ? (fee ?? 40) : 40}/>
    <label className="wide receipt-field" htmlFor={receiptId}><span>Payment receipt{receiptOptional ? <span className="receipt-optional">Optional during testing</span> : ""}</span><span className={`receipt-upload${fileName ? " has-file" : ""}`}>
      {fileName ? <FileCheck2 size={26} aria-hidden="true"/> : <UploadCloud size={26} aria-hidden="true"/>}
      <span className="receipt-upload-copy"><strong>{fileName || "Upload payment receipt"}</strong><small>{fileName ? "Click to replace file" : "Click to browse or choose a photo"}</small></span><span className="receipt-browse">Browse files</span>
      <input id={receiptId} name="receipt" type="file" accept="image/jpeg,image/png,application/pdf" required={!receiptOptional} aria-describedby={`${receiptId}-help`} onChange={event => {
        const file=event.currentTarget.files?.[0];
        setPreviewResult(null);
        if (file && (file.size > 3*1024*1024 || !["image/jpeg","image/png","application/pdf"].includes(file.type))) {
          setReceiptError("Choose a JPG, PNG or PDF file up to 3 MB.");setFileName("");event.currentTarget.value="";
        } else {setReceiptError("");setFileName(file?.name || "");}
      }}/>
    </span><small id={`${receiptId}-help`}>JPG, PNG or PDF · Maximum 3 MB</small>{receiptError && <span className="error" role="alert">{receiptError}</span>}</label>
    {!token && <MembershipDeclaration/>}
    <label className="wide member-consent"><input type="checkbox" name="consent" value="yes" required/>I confirm my details and any uploaded payment receipt are accurate. I agree to the use of these details for membership administration.</label>
    <div hidden aria-hidden="true"><input name="website" tabIndex={-1} autoComplete="off"/></div>
    <div className="wide">{submissionEnabled ? <SubmitButton pendingText="Submitting…">{token ? "Submit renewal for verification" : "Submit registration"}</SubmitButton> : <button type="submit" className="button membership-test-button">Test registration</button>}</div>
    {previewResult && <section className="wide membership-test-result" role="status" aria-live="polite"><CheckCircle2 size={24} aria-hidden="true"/><div><strong>Form check complete</strong><p>{previewResult.name} · {previewResult.location} · RM{previewResult.amount}</p><p>This was a test only. No application has been saved and no email has been sent.</p></div></section>}
  </form>;
}
