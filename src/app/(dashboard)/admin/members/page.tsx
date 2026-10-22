import Link from "next/link";
import { after } from "next/server";
import { deliverMembershipEmails } from "@/lib/membership-email";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { appOrigin, membershipEnabled, memberStatus, malaysiaDay, receiptOptionalForTesting, membershipEmailConfigured } from "@/lib/membership";
import { reviewPayment, retryMembershipEmails, reviewMemberRequest, updateMemberStatus } from "./actions";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export default async function MembersPage({searchParams}:{searchParams:Promise<{q?:string;status?:string;page?:string;id?:string;error?:string;success?:string;paymentPage?:string}>}) {
 const profile = await requireRole(["admin"]);
 if (!membershipEnabled()) return <AppShell profile={profile} title="Membership"><section className="panel"><h2>Membership setup</h2><p>The membership module is awaiting database and email configuration. Public registration is disabled until setup is verified.</p></section></AppShell>;
 const search = await searchParams;
 const page = Math.max(1,Math.min(100000,Number(search.page)||1));
 const q = (search.q || "").replace(/[^\p{L}\p{N}@.\s-]/gu,"").slice(0,100);
 const today = malaysiaDay();
 const db = createAdminClient();
 let query = db.from("memberships").select("id,full_name,email,room_no,member_type,status,created_at,expires_on",{count:"exact"}).order("created_at",{ascending:false});
 if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,room_no.ilike.%${q}%`);
 if (search.status === "block") query = query.or(`status.eq.cancelled,status.eq.suspended,and(status.eq.active,expires_on.lt.${today})`);
 else if (search.status === "active") query = query.eq("status","active").gte("expires_on",today);
 else if (["pending","cancelled","suspended"].includes(search.status || "")) query = query.eq("status",search.status!);
 const [members, pending, emails] = await Promise.all([
  query.range((page-1)*50,page*50-1),
  db.from("membership_payments").select("id,member_id,period_start,amount,receipt_path,created_at,memberships(full_name,room_no,email,photo_path,member_type,member_number)",{count:"exact"}).eq("status","pending_verification").order("created_at").limit(50),
  db.from("membership_emails").select("id,last_error",{count:"exact"}).eq("status","pending").limit(5),
 ]);
 if (members.error || pending.error || emails.error) return <AppShell profile={profile} title="Membership"><p className="error">Unable to load membership records. Confirm the database setup and refresh.</p></AppShell>;
 // Retry confirmations that were blocked before the email gateway was configured.
 if (membershipEmailConfigured() && emails.data?.some(email=>email.last_error==="disabled_or_missing_recipient")) {
  after(async()=>{try{await deliverMembershipEmails();}catch{console.error("Membership confirmation remains queued for retry.");}});
 }
 const receiptLinks = await Promise.all((pending.data||[]).map(async payment => {
  const {data} = payment.receipt_path ? await db.storage.from("membership-receipts").createSignedUrl(payment.receipt_path,300) : {data:null};
  const member=payment.memberships as unknown as {photo_path?:string|null}|null;
  const {data:photo}=member?.photo_path ? await db.storage.from("membership-photos").createSignedUrl(member.photo_path,300) : {data:null};
  return {payment,url:data?.signedUrl,photoUrl:photo?.signedUrl};
 }));
 const {data: publicRequests,error: publicRequestError}=await db.from("membership_requests").select("id,full_name,room_no,request_type,member_id,receipt_path,id_type,identification,email").eq("status","pending").order("created_at").limit(50);
 const publicRequestRows=await Promise.all((publicRequests||[]).map(async request=>{
  const {data}=request.receipt_path ? await db.storage.from("membership-receipts").createSignedUrl(request.receipt_path,300) : {data:null};
  return {...request,receiptUrl:data?.signedUrl};
 }));
 const selected = search.id && /^[a-f0-9-]{36}$/.test(search.id) ? search.id : null;
 const detail = selected ? await db.from("memberships").select("full_name,email,id_type,identification,gender,nationality,room_no,student_id,address,member_type,status,expires_on,photo_path,emergency_contact,emergency_relationship,access_card_path,member_number").eq("id",selected).maybeSingle() : null;
 const {data:detailPhoto}=detail?.data?.photo_path ? await db.storage.from("membership-photos").createSignedUrl(detail.data.photo_path,300) : {data:null};
 const {data:detailCard}=detail?.data?.access_card_path ? await db.storage.from("membership-photos").createSignedUrl(detail.data.access_card_path,300) : {data:null};
 const history = selected ? await db.from("membership_activity").select("id,event,created_at,actor_id,details").eq("member_id",selected).order("created_at",{ascending:false}).limit(100) : null;

 const actorIds=[...new Set((history?.data||[]).map(event=>event.actor_id).filter((id):id is string=>Boolean(id)))];
 const actors=actorIds.length ? await db.from("profiles").select("id,full_name").in("id",actorIds) : null;
 const actorNames=new Map((actors?.data||[]).map(actor=>[actor.id,actor.full_name]));
 const paymentPage=Math.max(1,Math.min(100000,Number(search.paymentPage)||1));
 const paymentOffset=(paymentPage-1)*25;
 const [paymentHistory,renewalUploads]=selected ? await Promise.all([
  db.from("membership_payments").select("id,kind,period_start,amount,receipt_path,status,review_note,reviewed_at,created_at",{count:"exact"}).eq("member_id",selected).order("created_at",{ascending:false}).range(paymentOffset,paymentOffset+24),
  db.from("membership_requests").select("id,receipt_path,status,review_note,reviewed_at,created_at",{count:"exact"}).eq("member_id",selected).eq("request_type","renew").neq("status","approved").order("created_at",{ascending:false}).range(paymentOffset,paymentOffset+24),
 ]) : [null,null];
 const paymentRows=await Promise.all([
  ...(paymentHistory?.data||[]).map(row=>({...row,source:"payment"})),
  ...(renewalUploads?.data||[]).map(row=>({...row,kind:"renewal",period_start:null,amount:40,source:"request"})),
 ].sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(async row=>{
  const {data}=row.receipt_path ? await db.storage.from("membership-receipts").createSignedUrl(row.receipt_path,300) : {data:null};
  return {...row,receiptUrl:data?.signedUrl};
 }));
 const paymentHasNext=Math.max(paymentHistory?.count||0,renewalUploads?.count||0)>paymentPage*25;
 const paymentPageUrl=(p:number)=>`/admin/members?${new URLSearchParams({id:selected||"",paymentPage:String(p)})}#payment-records`;
 const registerUrl = `${appOrigin()}/membership/register`;
 const pageUrl = (p:number) => `/admin/members?${new URLSearchParams({q,status:search.status||"",page:String(p)})}`;
 const errorText = search.error === "member_number" ? "Enter a member number (up to 50 characters) before approving Non Residence registration. Each number must be unique." : search.error === "status" ? "Status could not be changed. Refresh the member record, choose a different status and enter a reason with confirmation. Pending members need payment approval; expired members need an approved renewal before activation." : search.error === "verify" ? "Confirm payment was received before approving." : search.error === "reason" ? "Enter a reason before rejecting." : "Review could not be saved. The payment may already be reviewed, the membership may be cancelled, or its payment month has passed. Refresh and check the record.";
 return <AppShell profile={profile} title="Membership"><div className={`membership-admin${detail?.data ? " member-detail-view" : ""}`}>
  <div className="section-head"><div><p className="eyebrow">REGISTRATION & RENEWALS</p><h2>Membership</h2><p className="subtle">RM40 per month · RM10 Access Card Deposit for Non Residence · Pay cash at the Management Office</p></div><Link className="button secondary" href="/admin/members/payment-list">Monthly payment list</Link><Link className="button secondary" href="/admin/members/committee-reports">Committee reports</Link><Link className="button secondary" href="/gym">Gym patrol view</Link><Link className="button" href="/membership/register" target="_blank">Open registration</Link></div>
  {search.error && <div className="error" role="alert" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}><div><strong>Previous action notice</strong><p style={{margin:"6px 0 0"}}>{errorText}</p><small>This notice relates to the previous action. Check the current record status below before trying again.</small></div><Link href={pageUrl(page)} className="button secondary" style={{flexShrink:0}}>Dismiss</Link></div>}{search.success && <p role="status">{search.success==="status" ? "Membership status updated. Follow up on the physical access card." : "Payment review saved."}</p>}

  {detail?.data && <section className="panel member-profile">
   <div className="member-profile-heading"><div><p className="eyebrow">MEMBER PROFILE</p><h2>{detail.data.full_name}</h2><p className="subtle">{detail.data.email}</p></div><Link className="button secondary button-link" href={pageUrl(page)}>Back to members</Link></div>
   <div className="member-profile-layout"><aside className="member-identity">
    {detailPhoto?.signedUrl ? <a href={detailPhoto.signedUrl} target="_blank" rel="noreferrer"><img className="member-portrait" src={detailPhoto.signedUrl} alt={`Personal photo of ${detail.data.full_name}`}/></a> : <div className="member-portrait member-portrait-empty"><strong>{detail.data.full_name.split(/\s+/).map((part:string)=>part[0]).slice(0,2).join("")}</strong><span>No photo uploaded</span></div>}
    <span className={`member-state member-state-${detail.data.status}`}>{memberStatus(detail.data,today)}</span>
    <p>{detail.data.member_type==="outsider" ? "Non Residence" : "Residence tenant"}</p><small>Valid until</small><strong>{detail.data.expires_on ? new Date(detail.data.expires_on+"T00:00:00+08:00").toLocaleDateString("en-MY",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Kuala_Lumpur"}) : "Not activated"}</strong>
   </aside><div className="member-profile-info"><h3>Personal information</h3><dl className="member-info-grid">{[
    ["Full name",detail.data.full_name],["Email address",detail.data.email],["Identification type",detail.data.id_type],["IC / Passport number",detail.data.identification],["Gender",detail.data.gender],["Nationality",detail.data.nationality],["Student ID",detail.data.student_id],[detail.data.member_type === "resident" ? "ROOM NO" : "Address",detail.data.member_type === "resident" ? detail.data.room_no : detail.data.address||detail.data.room_no],["Member number",detail.data.member_number],
   ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value || "Not provided"}</dd></div>)}</dl>
   <div className="member-emergency"><h3>Emergency contact</h3><dl className="member-info-grid"><div><dt>Contact number</dt><dd>{detail.data.emergency_contact || "Not provided"}</dd></div><div><dt>Relationship</dt><dd>{detail.data.emergency_relationship || "Not provided"}</dd></div></dl></div>
   </div></div>

   <div className="member-history"><h3>Manage membership status</h3><p className="subtle">Changes do not extend validity or approve payment. Management must activate or block the physical access card separately.</p>
   {detail.data.status==="pending" ? <p>Approve the initial payment before managing membership status.</p> : <form action={updateMemberStatus} className="member-status-form" style={{display:"grid",gap:12,maxWidth:620}}>
    <input type="hidden" name="member" value={selected!}/><input type="hidden" name="expected" value={detail.data.status}/>
    <label>Status<select name="status" defaultValue={detail.data.status} required><option value="active" disabled={!detail.data.expires_on || detail.data.expires_on<today}>Active</option><option value="suspended">Suspended</option><option value="cancelled">Cancelled</option></select></label>
    <label>Reason<textarea name="note" required maxLength={1000} rows={3}/></label>
    <label><input type="checkbox" name="confirmed" value="yes" required/> I confirm this status change and will update the access card accordingly.</label>
    <SubmitButton pendingText="Saving status…">Save status</SubmitButton>
   </form>}</div>
   {detailCard?.signedUrl && <div className="member-history"><h3>Access Card</h3><p className="subtle">Use the code printed at the bottom to activate the card.</p><a href={detailCard.signedUrl} target="_blank" rel="noreferrer"><img src={detailCard.signedUrl} alt="Uploaded Access Card including activation code" style={{width:"100%",maxWidth:620,height:"auto",borderRadius:12}}/><p className="text-link">Open full-size card ↗</p></a></div>}
   <div className="member-history" id="payment-records"><div className="member-history-heading"><h3>Payment records</h3><span>Registration & renewals</span></div>
   {paymentHistory?.error || renewalUploads?.error ? <p className="error">Unable to load payment records. Please refresh.</p> : !paymentRows.length ? <p className="subtle">No payment records on this page.</p> : <div className="table-wrap"><table className="table"><thead><tr><th>Submitted</th><th>Type / Month</th><th>Amount</th><th>Status</th><th>Receipt</th><th>Review</th></tr></thead><tbody>{paymentRows.map(row=><tr key={row.source+row.id}><td>{new Date(row.created_at).toLocaleString("en-MY",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Kuala_Lumpur"})}</td><td>{row.kind==="renewal" ? "Renewal" : "Registration"}<br/><small>{row.period_start ? row.period_start.slice(0,7) : "Month assigned on approval"}</small></td><td>RM{Number(row.amount).toFixed(2)}</td><td><span className="badge">{row.status==="approved" ? "Approved" : row.status==="rejected" ? "Rejected" : row.status==="pending" || row.status==="pending_verification" ? "Pending review" : row.status.replaceAll("_"," ")}</span></td><td>{row.receiptUrl ? <a className="text-link" href={row.receiptUrl} target="_blank" rel="noreferrer">View receipt ↗</a> : row.receipt_path ? "Unavailable — refresh" : "No receipt uploaded"}</td><td style={{whiteSpace:"normal",minWidth:160,maxWidth:300,overflowWrap:"anywhere"}}>{row.review_note || "—"}{row.reviewed_at && <><br/><small>{new Date(row.reviewed_at).toLocaleString("en-MY",{timeZone:"Asia/Kuala_Lumpur"})}</small></>}</td></tr>)}</tbody></table></div>}
   <p className="subtle" style={{fontSize:12,marginTop:16}}>Receipt links expire after 5 minutes. Refresh this page to reopen them.</p>
   {(paymentPage>1 || paymentHasNext) && <div className="actions">{paymentPage>1 && <Link className="button secondary" href={paymentPageUrl(paymentPage-1)}>Previous records</Link>}<span>Page {paymentPage}</span>{paymentHasNext && <Link className="button secondary" href={paymentPageUrl(paymentPage+1)}>More records</Link>}</div>}
   </div>
   <div className="member-history"><div className="member-history-heading"><h3>Activity history</h3><span>Latest updates</span></div>{history?.error ? <p className="error">Unable to load activity history.</p> : !history?.data?.length ? <p className="subtle">No activity recorded yet.</p> : <ol className="member-timeline">{history.data.map(event=>{
    const labels:Record<string,string>={payment_approved:"Payment approved",payment_rejected:"Payment rejected",receipt_submitted:"Payment receipt submitted",registration_submitted:"Registration submitted",rules_accepted:"Membership rules accepted",renewal_requested:"Renewal requested",cancelled:"Membership cancelled",status_changed:"Membership status changed",member_number_assigned:"Member number assigned"};
    const data=event.details && typeof event.details==="object" && !Array.isArray(event.details) ? event.details as Record<string,unknown> : {};
    return <li key={event.id}><span className="member-timeline-dot"/><div><strong>{labels[event.event] || event.event.replaceAll("_"," ").replace(/^./,(c:string)=>c.toUpperCase())}</strong><p>{event.actor_id ? `Management · ${actorNames.get(event.actor_id) || "Admin"}` : "Submitted by member"}{typeof data.amount==="number" ? ` · RM${data.amount}` : ""}{typeof data.period==="string" ? ` · Membership month: ${data.period.slice(0,7)}` : ""}</p>{event.event==="status_changed" && <p>{String(data.from || "")} → {String(data.to || "")}</p>}{typeof data.note==="string" && data.note.trim() && <p className="member-review-note">{data.note}</p>}{event.event==="rules_accepted" && Array.isArray(data.clauses) && <details><summary>View accepted rules</summary><ul>{data.clauses.filter((clause:unknown)=>typeof clause==="string").map((clause:string,index:number)=><li key={index}>{clause}</li>)}</ul></details>}</div><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString("en-MY",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Kuala_Lumpur"})}</time></li>;
   })}</ol>}</div>
  </section>}

  <section className="grid-2" style={{alignItems:"start"}}><article className="panel"><h3>Registration link & QR code</h3><p><a href={registerUrl}>{registerUrl}</a></p><img src="/api/membership/qr" width="180" height="180" alt="Scan to register for membership"/><p><a className="button secondary" href="/api/membership/qr?download=1">Download QR code</a></p></article><article className="panel"><h3>Renewal reminders</h3><p>Automatically queued on the third-last day of each month. Members who have renewed are excluded before delivery.</p><p>Pending emails: <strong>{emails.count || 0}</strong></p>{emails.data?.filter(email=>email.last_error).map(email=><p className="error" key={email.id}>Email pending: {email.last_error === "disabled_or_missing_recipient" ? "Email delivery is not enabled in this environment, or the recipient email is missing. Approval is saved; this message remains queued." : email.last_error}</p>)}<form action={retryMembershipEmails}><SubmitButton pendingText="Sending…">Retry pending emails</SubmitButton></form><p className="subtle">Access cards require Management action unless a door access integration is configured.</p></article></section>
  <section className="panel"><h3>Renewal & cancellation requests</h3>{publicRequestError ? <p className="error">Unable to load requests.</p> : !publicRequestRows.length ? <p>No requests awaiting review.</p> : publicRequestRows.map(request=><article key={request.id} style={{borderTop:"1px solid var(--line)",padding:"18px 0"}}><h4>{request.full_name} · {request.room_no} · {request.request_type==="renew"?"Renewal":"Cancellation"}</h4><p>{request.id_type} {request.identification} {request.email ? " · "+request.email : ""}</p>{request.member_id ? <Link href={`/admin/members?id=${request.member_id}`}>View matched member</Link> : <p className="error">No unique member match. Verify these details with the applicant before accepting a new request.</p>}{request.receiptUrl && <p><a href={request.receiptUrl} target="_blank" rel="noreferrer">View receipt</a></p>}<form action={reviewMemberRequest}><input type="hidden" name="request" value={request.id}/><p><label><input type="checkbox" name="verified" value="yes"/> I verified the member&apos;s request and any required payment.</label></p><label>Review note / rejection reason<input name="note" maxLength={1000}/></label><p style={{display:"flex",gap:10}}><button className="button" name="decision" value="approve" disabled={!request.member_id || (request.request_type==="renew" && !request.receiptUrl && !receiptOptionalForTesting())}>Approve request</button><button className="button secondary" name="decision" value="reject">Reject request</button></p></form></article>)}</section>
  <section className="panel"><h3>Payment verification ({pending.count || 0})</h3><p className="subtle">Check the actual bank transaction before approval. Receipt file format checks do not confirm a bank transfer.</p>{receiptLinks.length ? receiptLinks.map(({payment,url,photoUrl})=> {
   const member = payment.memberships as unknown as {full_name:string;room_no:string;email:string;member_type:string;member_number:string|null}|null;
   return <article key={payment.id} style={{borderTop:"1px solid var(--line)",padding:"18px 0"}}><h4><Link href={`/admin/members?id=${payment.member_id}`}>{member?.full_name}</Link> · {member?.room_no}</h4>{photoUrl && <p><a href={photoUrl} target="_blank" rel="noreferrer"><img src={photoUrl} alt={`Personal photo of ${member?.full_name || "member"}`} style={{width:90,height:110,objectFit:"cover",borderRadius:10}}/></a></p>}<p>{member?.email} · {payment.period_start.slice(0,7)} · <strong>RM{payment.amount}</strong></p>{url ? <a href={url} target="_blank" rel="noreferrer">View receipt (link expires in 5 minutes)</a> : <p className="subtle">{payment.receipt_path ? "Receipt unavailable. Refresh before reviewing." : "No receipt uploaded (test submission)."}</p>}<form action={reviewPayment}><input type="hidden" name="payment" value={payment.id}/><p><label><input type="checkbox" name="verified" value="yes"/> I verified that the correct payment was received.</label></p>{member?.member_type === "outsider" && <label>Member number<input name="member_number" defaultValue={member.member_number || ""} maxLength={50} placeholder="Enter member number before approval" aria-label={`Member number for ${member.full_name}`}/><small>Required when approving a Non Residence registration.</small></label>}<label>Review note / rejection reason<input name="note" maxLength={1000} aria-label={`Review note for ${member?.full_name}`}/></label><p style={{display:"flex",gap:10,flexWrap:"wrap"}}><button className="button" name="decision" value="approve" disabled={!url && !(receiptOptionalForTesting() && !payment.receipt_path)}>Approve payment</button><button className="button secondary" name="decision" value="reject">Reject receipt</button></p></form></article>;
  }) : <p>No receipts awaiting verification.</p>}{(pending.count||0)>50 && <p>Showing the oldest 50 receipts. Review these to see the next pending receipts.</p>}</section>
  <section className="panel"><div className="section-head"><h3>Member list ({members.count || 0})</h3><a className="button secondary" href="/admin/members/export">Download card blocking list</a></div><form style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:20}}><input name="q" defaultValue={q} placeholder="Search name, email or address" aria-label="Search members"/><select name="status" defaultValue={search.status || ""} aria-label="Membership status"><option value="">All members</option><option value="active">Active</option><option value="pending">Pending approval</option><option value="block">Cards to block</option><option value="suspended">Suspended</option><option value="cancelled">Cancelled</option></select><button className="button">Search / Filter</button></form><div className="table-wrap"><table className="table"><thead><tr><th>Member</th><th>Address</th><th>Registered</th><th>Valid until</th><th>Status</th></tr></thead><tbody>{members.data?.map(member=><tr key={member.id}><td><Link href={`/admin/members?id=${member.id}`}>{member.full_name}</Link></td><td>{member.room_no}</td><td>{new Date(member.created_at).toLocaleDateString("en-MY",{timeZone:"Asia/Kuala_Lumpur"})}</td><td>{member.expires_on || "—"}</td><td>{memberStatus(member,today)}</td></tr>)}</tbody></table>{!members.data?.length && <p>No matching members.</p>}</div><p>Page {page} · {page>1 && <Link href={pageUrl(page-1)}>Previous</Link>} {page*50<(members.count||0) && <Link href={pageUrl(page+1)}>Next</Link>}</p></section>

 </div></AppShell>;
}
