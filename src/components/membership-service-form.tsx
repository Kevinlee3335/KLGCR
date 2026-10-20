"use client";
import { useActionState,useId,useState } from "react";
import { UploadCloud } from "lucide-react";
import { MembershipPayment } from "./membership-payment";
import { SubmitButton } from "./submit-button";
import { submitPublicMemberRequest } from "@/app/membership/actions";
export function MembershipServiceForm({intent,receiptOptional}:{intent:"renew"|"cancel";receiptOptional:boolean}) {
 const [state,action]=useActionState(submitPublicMemberRequest,{error:"",success:""});
 const [fileName,setFileName]=useState("");const id=useId();
 return <form action={action} className="membership-form">
  <input type="hidden" name="intent" value={intent}/>
  {state.error && <p className="error wide" role="alert">{state.error}</p>}
  {state.success && <p className="success wide" role="status">{state.success}</p>}
  <label>Full name<input name="full_name" autoComplete="name" maxLength={200} required/></label>
  <label>Address<input name="room_no" maxLength={200} required/></label>
  {intent==="renew" && <><p className="fee-note wide">Monthly renewal: <strong>RM40</strong>. Management will match your details and verify your payment.</p><MembershipPayment amount={40}/><label className="wide receipt-field" htmlFor={id}><span>Payment receipt {receiptOptional && <span className="receipt-optional">Optional during testing</span>}</span><span className={`receipt-upload${fileName?" has-file":""}`}><UploadCloud size={26} aria-hidden="true"/><span className="receipt-upload-copy"><strong>{fileName||"Upload payment receipt"}</strong><small>JPG, PNG or PDF · Maximum 3 MB</small></span><span className="receipt-browse">Browse files</span><input id={id} name="receipt" type="file" accept="image/jpeg,image/png,application/pdf" required={!receiptOptional} onChange={event=>setFileName(event.currentTarget.files?.[0]?.name||"")}/></span></label></>}
  <label className="wide member-consent"><input type="checkbox" name="consent" value="yes" required/>{intent==="renew"?"I confirm these are my membership details and any uploaded receipt is accurate.":"I request cancellation of my membership and understand Management must verify this request."}</label>
  <div hidden aria-hidden="true"><input name="website" tabIndex={-1} autoComplete="off"/></div>
  <div className="wide"><SubmitButton pendingText="Submitting…">{intent==="renew"?"Submit renewal":"Submit cancellation request"}</SubmitButton></div>
 </form>;
}
