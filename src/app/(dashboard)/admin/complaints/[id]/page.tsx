import Link from "next/link";
import { ArrowLeft, CalendarDays, ExternalLink, UserRound, X } from "lucide-react";
import { notFound } from "next/navigation";
import { RejectComplaintForm } from "@/components/reject-complaint-form";
import { AppShell } from "@/components/app-shell";
import { AssignmentForm, ComplaintForm } from "@/components/complaint-form";
import { requireRole } from "@/lib/auth";
import { type ComplaintRow } from "@/lib/phase2";
import { createClient } from "@/lib/supabase/server";

const complaintNumber=(value:string)=>{const sequence=value.match(/(\d+)$/)?.[1];return sequence?`KLGCR-CMP-${sequence.padStart(6,"0")}`:value};
const statusLabel=(value:string)=>({new:"New",under_review:"Reviewed",assigned:"Assigned",rejected:"Rejected",closed:"Closed"}[value]||value);
const priorityLabel=(value:string)=>({low:"Low",normal:"Medium",high:"High",urgent:"Emergency"}[value]||value);
const datePart=(value:string,part:"date"|"time")=>new Intl.DateTimeFormat("en-MY",{timeZone:"Asia/Kuala_Lumpur",...(part==="date"?{day:"2-digit",month:"long",year:"numeric"}:{hour:"2-digit",minute:"2-digit",hour12:true})}).format(new Date(value));

export default async function ComplaintDetail({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<{error?:string;saved?:string}> }) {
  const profile = await requireRole(["admin"]);
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("complaints").select("id,complaint_no,source,source_reference,photo_url,reporter_email,room_no,complainant_name,complainant_contact,category,description,priority,status,submitted_at,reviewed_at,assigned_at,block:blocks!block_id(id,code),assignee:profiles!assigned_to(id,full_name),reviewer:profiles!reviewed_by(full_name)").eq("id",id).single();
  if (!data) notFound();
  const complaint = data as unknown as ComplaintRow;
  const detail = data as unknown as { photo_url:string|null; source_reference:string|null; reporter_email:string|null; reviewed_at:string|null; reviewer:{full_name:string}|null };
  const [{data:blocks},{data:eligible}] = await Promise.all([
    supabase.from("blocks").select("id,code").eq("is_active",true).order("code"),
    supabase.from("profiles").select("id,full_name,profile_blocks!inner(block_id)").eq("role","maintenance_staff").eq("is_active",true).eq("profile_blocks.block_id",complaint.block!.id),
  ]);
  const events=[
    {label:"Complaint Created",at:complaint.submitted_at,user:complaint.complainant_name||"Resident",remark:"Maintenance request submitted"},
    ...(detail.reviewed_at?[{label:complaint.status==="rejected"?"Rejected":"Admin Reviewed",at:detail.reviewed_at,user:detail.reviewer?.full_name||"Administrator",remark:complaint.status==="rejected"?"Complaint rejected":"Complaint details reviewed"}]:[]),
    ...(complaint.assigned_at?[{label:"Assigned",at:complaint.assigned_at,user:complaint.assignee?.full_name||"Maintenance staff",remark:"Maintenance job created"}]:[]),
  ];

  return <AppShell profile={profile} title="Complaint Management"><div className="complaint-drawer-stage"><Link className="drawer-backdrop" href="/admin/complaints" aria-label="Close complaint"/><aside className="complaint-drawer" aria-label="Complaint details"><header className="drawer-header"><div><Link className="drawer-back" href="/admin/complaints"><ArrowLeft size={16}/> Complaints</Link><p className="eyebrow">Complaint Details</p><h2>{complaintNumber(complaint.complaint_no)}</h2></div><Link className="drawer-close" href="/admin/complaints" aria-label="Close"><X size={20}/></Link></header><div className="drawer-body">
    {query.error&&<p className="error">{query.error}</p>}{query.saved&&<p className="success">Review changes saved.</p>}
    <div className="drawer-badges"><span className={`priority-badge priority-${complaint.priority}`}>{priorityLabel(complaint.priority)}</span><span className={`status-badge status-${complaint.status}`}>{statusLabel(complaint.status)}</span></div>
    <section className="complaint-info-card"><div><span>Submitted Date</span><strong>{datePart(complaint.submitted_at,"date")}</strong></div><div><span>Submitted Time</span><strong>{datePart(complaint.submitted_at,"time")}</strong></div><div><span>Student Name</span><strong>{complaint.complainant_name||"Not provided"}</strong></div><div><span>Phone</span><strong>{complaint.complainant_contact||"Not provided"}</strong></div><div><span>Email</span><strong>{detail.reporter_email||"Not provided"}</strong></div><div><span>Location</span><strong>Block {complaint.block?.code} · Room {complaint.room_no}</strong></div><div><span>Category</span><strong>{complaint.category}</strong></div><div className="info-wide"><span>Description</span><p>{complaint.description}</p></div></section>
    {detail.photo_url&&<a className="complaint-attachment" href={detail.photo_url} target="_blank" rel="noreferrer"><span><strong>Uploaded Photo</strong><small>Open the original complaint attachment</small></span><ExternalLink size={17}/></a>}
    <section className="drawer-section"><div className="drawer-section-title"><h3>Complaint Timeline</h3><span>{events.length} event{events.length===1?"":"s"}</span></div><div className="complaint-timeline">{events.map((event,index)=><div key={`${event.label}-${event.at}`}><i className={index===events.length-1?"current":""}/><div><strong>{event.label}</strong><span><CalendarDays size={13}/>{datePart(event.at,"date")} · {datePart(event.at,"time")}</span><span><UserRound size={13}/>{event.user}</span><small>{event.remark}</small></div></div>)}</div></section>
    <section className="drawer-section"><div className="drawer-section-title"><h3>Review Complaint</h3><span>Update details and priority</span></div><ComplaintForm blocks={blocks||[]} complaint={complaint} mode="review"/></section>
    {!['assigned','rejected','closed'].includes(complaint.status)&&<section className="drawer-section drawer-actions"><div className="drawer-section-title"><h3>Next Action</h3><span>Eligible staff for Block {complaint.block?.code}</span></div><AssignmentForm complaintId={id} eligible={eligible||[]}/><RejectComplaintForm complaintId={id}/></section>}
  </div></aside></div></AppShell>;
}
