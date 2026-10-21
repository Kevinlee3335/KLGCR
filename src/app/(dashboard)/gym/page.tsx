import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { malaysiaDay, membershipEnabled } from "@/lib/membership";
import { gymGroups, gymStatus, type GymGroup } from "@/lib/gym-patrol";
import { LogoutForm } from "@/components/logout-form";
import "./patrol.css";

export const dynamic="force-dynamic";
export const metadata={title:"Gym Member Check"};
const labels:Record<GymGroup,string>={active:"Active",expired:"Expired",blocked:"Suspended / Cancelled"};
const date=(value:string)=>new Date(value).toLocaleString("en-MY",{timeZone:"Asia/Kuala_Lumpur",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
const validDate=(value:string|null)=>value ? new Date(value+"T00:00:00+08:00").toLocaleDateString("en-MY",{timeZone:"Asia/Kuala_Lumpur",day:"numeric",month:"short",year:"numeric"}) : "Not activated";
const paymentStatus=(status:string)=>status==="approved" ? "Approved" : status==="rejected" ? "Rejected" : "Pending review";

export default async function GymPage({searchParams}:{searchParams:Promise<{q?:string;group?:string;page?:string;id?:string;payments?:string}>}) {
 const profile=await requireRole(["gym_patrol","admin"]);
 const search=await searchParams;
 const group=gymGroups.includes(search.group as GymGroup) ? search.group as GymGroup : "active";
 const q=(search.q||"").replace(/[^\p{L}\p{N} ._-]/gu,"").slice(0,100);
 const page=Math.max(1,Math.min(100000,Number(search.page)||1));
 const paymentPage=Math.max(1,Math.min(100000,Number(search.payments)||1));
 const selected=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(search.id||"") ? search.id! : null;
 const today=malaysiaDay();
 const url=(options:{group?:GymGroup;page?:number;id?:string;payments?:number}={})=>"/gym?"+new URLSearchParams({group:options.group||group,q,page:String(options.page||page),...(options.id?{id:options.id,payments:String(options.payments||1)}:{})});
 const shell=(content:React.ReactNode)=><main className="gym-patrol"><header className="gym-header"><Link href="/gym" aria-label="Gym member check home"><img src="/klg-logo.svg" alt="KLG Campus Residence" width="224" height="48"/></Link><div className="gym-account"><span>{profile.full_name}<small>Gym member check · Read only</small></span><LogoutForm/></div></header><div className="gym-content">{content}</div><footer className="gym-footer"><Link href="/account">Change password</Link>{profile.role==="admin" && <Link href="/admin/members">Back to Membership Admin</Link>}</footer></main>;
 if(!membershipEnabled()) return shell(<section className="gym-panel"><h1>Gym member check</h1><p>Membership access is not enabled yet.</p></section>);
 const db=createAdminClient();
 function memberQuery(bucket:GymGroup,head=false){
  let query=db.from("memberships").select("id,full_name,student_id,status,expires_on,photo_path",{count:"exact",head});
  if(bucket==="active") query=query.eq("status","active").gte("expires_on",today);
  else if(bucket==="expired") query=query.eq("status","active").lt("expires_on",today);
  else query=query.in("status",["suspended","cancelled"]);
  if(q) query=query.or(`full_name.ilike.%${q}%,student_id.ilike.%${q}%`);
  return query;
 }
 const [members,counts,detail,payments,requests,declaration]=await Promise.all([
  memberQuery(group).order("full_name").order("id").range((page-1)*30,page*30-1),
  Promise.all(gymGroups.map(bucket=>memberQuery(bucket,true))),
  selected ? db.from("memberships").select("id,full_name,email,member_type,id_type,identification,gender,nationality,address,room_no,student_id,emergency_contact,emergency_relationship,status,expires_on,created_at,photo_path,access_card_path").eq("id",selected).maybeSingle() : null,
  selected ? db.from("membership_payments").select("id,kind,period_start,amount,status,receipt_path,created_at,reviewed_at",{count:"exact"}).eq("member_id",selected).order("created_at",{ascending:false}).order("id").range((paymentPage-1)*20,paymentPage*20-1) : null,
  selected ? db.from("membership_requests").select("id,status,receipt_path,created_at,reviewed_at",{count:"exact"}).eq("member_id",selected).eq("request_type","renew").neq("status","approved").order("created_at",{ascending:false}).order("id").range((paymentPage-1)*20,paymentPage*20-1) : null,
  selected ? db.from("membership_activity").select("created_at,details").eq("member_id",selected).eq("event","rules_accepted").order("created_at",{ascending:false}).limit(1).maybeSingle() : null,
 ]);
 const photoUrl=async(path:string|null)=>{
  if(!path) return null;
  const {data}=await db.storage.from("membership-photos").createSignedUrl(path,300);
  return data?.signedUrl||null;
 };
 const [cards,portrait,accessCard,paymentRows]=await Promise.all([
  Promise.all((members.data||[]).map(async member=>({...member,photo:await photoUrl(member.photo_path)}))),
  photoUrl(detail?.data?.photo_path||null),
  photoUrl(detail?.data?.access_card_path||null),
  Promise.all([
   ...(payments?.data||[]).map(row=>({...row,source:"payment"})),
   ...(requests?.data||[]).map(row=>({...row,kind:"renewal",period_start:null,amount:40,source:"request"})),
  ].sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(async row=>{
   const {data}=row.receipt_path ? await db.storage.from("membership-receipts").createSignedUrl(row.receipt_path,300) : {data:null};
   return {...row,receipt:data?.signedUrl};
  })),
 ]);
 const morePayments=Math.max(payments?.count||0,requests?.count||0)>paymentPage*20;
 return shell(<>
  <div className="gym-title"><div><p className="gym-eyebrow">KLGCR GYM · PATROL</p><h1>Member check</h1><p>Match the person with their photo and Student ID.</p></div><span className="gym-readonly">View only</span></div>
  <p className="gym-notice">A submitted receipt does not activate membership. Only an approved, unexpired Active membership is valid.</p>
  {selected && <section className="gym-panel gym-detail" aria-label="Member details">
   <Link className="gym-back" href={url()}>← Back to members</Link>
   {detail?.error ? <p role="alert">Unable to load this member. Please refresh.</p> : !detail?.data ? <p>Member not found.</p> : <>
    <div className="gym-identity"><div><p className="gym-eyebrow">MEMBER DETAILS</p><h2>{detail.data.full_name}</h2><dl><div><dt>Student ID</dt><dd>{detail.data.student_id||"Not provided"}</dd></div><div><dt>Status</dt><dd><span className={`gym-status ${gymStatus(detail.data,today).toLowerCase().replaceAll(" ","-")}`}>{gymStatus(detail.data,today)}</span></dd></div><div><dt>Valid until</dt><dd>{validDate(detail.data.expires_on)}</dd></div></dl></div>{portrait ? <a href={portrait} target="_blank" rel="noreferrer"><img className="gym-portrait" src={portrait} alt={`Personal photo of ${detail.data.full_name}`}/></a> : <div className="gym-photo-empty">No photo uploaded</div>}</div>
    <section className="gym-registration-info" aria-label="Registration information"><h3>Registration information</h3><dl>{[
     ["Full name",detail.data.full_name],["Email address",detail.data.email],["Member type",detail.data.member_type==="outsider"?"Non Residence":"Residence tenant"],
     ["Identification type",detail.data.id_type],["IC / Passport number",detail.data.identification],["Gender",detail.data.gender],["Nationality",detail.data.nationality],
     ["Address",detail.data.address||detail.data.room_no],["Student ID",detail.data.student_id],["Registered on",date(detail.data.created_at)],
     ["Emergency contact number",detail.data.emergency_contact],["Relationship",detail.data.emergency_relationship],
    ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||"Not provided"}</dd></div>)}</dl></section>
    {detail.data.member_type==="resident" && <section className="gym-registration-info"><h3>Access Card photo</h3>{accessCard ? <a href={accessCard} target="_blank" rel="noreferrer"><img className="gym-access-card" src={accessCard} alt="Uploaded Access Card with activation code"/><span className="gym-open">Open full-size card ↗</span></a> : <p>{detail.data.access_card_path?"Photo unavailable — refresh":"No Access Card photo uploaded"}</p>}</section>}
    <section className="gym-registration-info"><h3>Membership rules & declaration</h3>{declaration?.error ? <p role="alert">Unable to load the declaration. Please refresh.</p> : declaration?.data ? <><p className="gym-fineprint">Accepted {date(declaration.data.created_at)}</p>{(()=>{
     const data=declaration.data.details as {version?:unknown;clauses?:unknown}|null;
     return <>{typeof data?.version==="string" && <p className="gym-fineprint">Version {data.version}</p>}{Array.isArray(data?.clauses) && <ol className="gym-rules">{data.clauses.filter((clause:unknown)=>typeof clause==="string").map((clause:string,index:number)=><li key={index}>{clause}</li>)}</ol>}</>;
    })()}</> : <p>No saved declaration record for this application.</p>}</section>
    <div className="gym-payment-heading" id="payment-records"><h3>Payment records</h3><span>Registration & renewals</span></div>
    {payments?.error||requests?.error ? <p role="alert">Unable to load payment records. Please refresh.</p> : !paymentRows.length ? <p>No payment records on this page.</p> : <div className="gym-payments">{paymentRows.map(row=><article key={row.source+row.id} className="gym-payment"><div><strong>{row.kind==="registration"?"Registration":"Renewal"} · {row.period_start?.slice(0,7)||"Month pending approval"}</strong><small>Submitted {date(row.created_at)}</small>{row.reviewed_at && <small>Reviewed {date(row.reviewed_at)}</small>}</div><div className="gym-payment-amount"><strong>RM{Number(row.amount).toFixed(2)}</strong><span className={`gym-status ${row.status==="approved"?"active":row.status==="rejected"?"cancelled":"pending"}`}>{paymentStatus(row.status)}</span></div><div>{row.receipt ? <a className="button secondary" href={row.receipt} target="_blank" rel="noreferrer">View receipt ↗</a> : <span>{row.receipt_path?"Receipt unavailable — refresh":"No receipt uploaded"}</span>}</div></article>)}</div>}
    {(paymentPage>1||morePayments) && <nav className="gym-pagination" aria-label="Payment record pages">{paymentPage>1&&<Link className="button secondary" href={url({id:selected,payments:paymentPage-1})+"#payment-records"}>Previous records</Link>}<span>Page {paymentPage}</span>{morePayments&&<Link className="button secondary" href={url({id:selected,payments:paymentPage+1})+"#payment-records"}>More records</Link>}</nav>}
    <p className="gym-fineprint">Photos and receipt links expire after 5 minutes. Refresh to reopen. Keep member details and receipts private.</p>
   </>}
  </section>}
  <form className="gym-search" action="/gym"><input type="hidden" name="group" value={group}/><label htmlFor="gym-search">Find a member</label><div><input id="gym-search" name="q" defaultValue={q} placeholder="Name or Student ID" maxLength={100}/><button className="button" type="submit">Search</button>{q&&<Link className="button secondary" href={"/gym?group="+group}>Clear</Link>}</div></form>
  <nav className="gym-tabs" aria-label="Member status groups">{gymGroups.map((bucket,index)=><Link key={bucket} href={url({group:bucket,page:1})} aria-current={group===bucket?"page":undefined}><span>{labels[bucket]}</span><strong>{counts[index].error?"—":counts[index].count||0}</strong></Link>)}</nav>
  {members.error ? <p className="gym-panel" role="alert">Unable to load members. Please refresh.</p> : <><div className="gym-member-grid">{cards.map(member=><Link className="gym-member-card" key={member.id} href={url({id:member.id})} aria-label={`View ${member.full_name}, ${gymStatus(member,today)}`}><div>{member.photo ? <img src={member.photo} alt={`Personal photo of ${member.full_name}`} loading="lazy"/> : <span className="gym-photo-empty">No photo</span>}</div><div><span className={`gym-status ${gymStatus(member,today).toLowerCase()}`}>{gymStatus(member,today)}</span><h2>{member.full_name}</h2><p>Student ID <strong>{member.student_id||"Not provided"}</strong></p><p>Valid until {validDate(member.expires_on)}</p><span className="gym-open">View details & payments →</span></div></Link>)}</div>{!cards.length&&<p className="gym-panel">No matching {labels[group].toLowerCase()} members.</p>}<nav className="gym-pagination" aria-label="Member pages">{page>1&&<Link className="button secondary" href={url({page:page-1})}>Previous</Link>}<span>Page {page} · {members.count||0} members</span>{page*30<(members.count||0)&&<Link className="button secondary" href={url({page:page+1})}>More members</Link>}</nav></>}
 </>);
}
