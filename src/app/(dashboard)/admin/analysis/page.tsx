import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type JobRow={status:string;block:{code:string}|null};
type CheckoutRow={status:string;block:{code:string}|null};
type ComplianceRow={next_due_date:string;record_type:"servicing"|"certificate_license"};

const closedJobStatuses=new Set(["completed","cancelled","closed"]);
const terminalCheckoutStatuses=new Set(["ready","ready_for_occupancy"]);
const label=(value:string)=>value.replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase());

function dueState(date:string){const today=new Date();today.setHours(0,0,0,0);const due=new Date(date+"T00:00:00");const days=Math.ceil((due.getTime()-today.getTime())/86400000);return days<0?"expired":days<=30?"due":"active";}

export default async function AnalysisPage(){
  const profile=await requireRole(["admin","management_viewer"]);
  const db=await createClient();
  const [{data:jobs,error:jobsError},{data:checkouts,error:checkoutsError},{data:compliance,error:complianceError},{count:newComplaints}]=await Promise.all([
    db.from("maintenance_jobs").select("status,block:blocks!block_id(code)"),
    db.from("checkout_rooms").select("status,block:blocks!block_id(code)"),
    db.from("compliance_records").select("next_due_date,record_type"),
    db.from("complaints").select("*",{count:"exact",head:true}).eq("status","new"),
  ]);
  const allJobs=(jobs??[]) as unknown as JobRow[];
  const activeJobs=allJobs.filter((job)=>!closedJobStatuses.has(job.status));
  const allCheckouts=(checkouts??[]) as unknown as CheckoutRow[];
  const activeCheckouts=allCheckouts.filter((room)=>!terminalCheckoutStatuses.has(room.status));
  const records=(compliance??[]) as ComplianceRow[];
  const expired=records.filter((record)=>dueState(record.next_due_date)==="expired").length;
  const dueSoon=records.filter((record)=>dueState(record.next_due_date)==="due").length;
  const blocks=["A","B","C","D"].map((code)=>({
    code,
    jobs:activeJobs.filter((job)=>job.block?.code===code).length,
    checkouts:activeCheckouts.filter((room)=>room.block?.code===code).length,
  }));
  const checkoutStages=[
    ["intake","Awaiting inspection"],["inspection","Second inspection"],["rectification","Maintenance rectification"],["cleaning","Housekeeping cleaning"],["verification","Final verification"],
  ].map(([status,name])=>({name,count:activeCheckouts.filter((room)=>room.status===status).length}));
  const jobStages=["assigned","in_progress","pending_material","under_monitoring"].map((status)=>({name:label(status),count:activeJobs.filter((job)=>job.status===status).length}));
  const error=jobsError||checkoutsError||complianceError;

  return <AppShell profile={profile} title="Analysis">
    <div className="section-head inventory-heading"><div><p className="eyebrow">Live operational view</p><h2>Operations Analysis</h2><p className="subtle">A clear live summary to decide what needs attention first. Figures update from current App records.</p></div></div>
    {error&&<p className="error">Some analysis data could not load: {error.message}</p>}
    <section className="inventory-kpis">
      <article className="danger"><span>New complaints</span><strong>{newComplaints??0}</strong><small>Need Admin review</small></article>
      <article className="warning"><span>Active maintenance</span><strong>{activeJobs.length}</strong><small>Not completed or cancelled</small></article>
      <article className="gold"><span>Check-out rooms active</span><strong>{activeCheckouts.length}</strong><small>Still not ready for occupancy</small></article>
      <article className={expired?"danger":"warning"}><span>Compliance attention</span><strong>{expired+dueSoon}</strong><small>{expired} expired · {dueSoon} due within 30 days</small></article>
    </section>
    <section className="panel inventory-stock-card"><div className="section-head compact-head"><div><h3>Block workload</h3><p className="subtle">Open maintenance and check-out workload by block.</p></div></div><div className="mobile-cards" style={{display:"grid"}}>{blocks.map((block)=><article className="record-card" key={block.code}><strong>Block {block.code}</strong><div className="record-meta"><span>{block.jobs} active maintenance jobs</span><span>{block.checkouts} check-out rooms in progress</span></div></article>)}</div></section>
    <div className="two-column">
      <section className="panel inventory-stock-card"><div className="section-head compact-head"><div><h3>Maintenance status</h3><p className="subtle">Use this to move delayed work forward.</p></div><Link className="button secondary button-link" href="/admin/jobs">Open jobs</Link></div><div className="mobile-cards" style={{display:"grid"}}>{jobStages.map((stage)=><article className="record-card" key={stage.name}><strong>{stage.name}</strong><div className="record-meta"><span>{stage.count} jobs</span></div></article>)}</div></section>
      <section className="panel inventory-stock-card"><div className="section-head compact-head"><div><h3>Check-out stage</h3><p className="subtle">See where room turnover is waiting.</p></div><Link className="button secondary button-link" href="/admin/checkouts">Open check-outs</Link></div><div className="mobile-cards" style={{display:"grid"}}>{checkoutStages.map((stage)=><article className="record-card" key={stage.name}><strong>{stage.name}</strong><div className="record-meta"><span>{stage.count} rooms</span></div></article>)}</div></section>
    </div>
    <section className="panel inventory-stock-card"><div className="section-head compact-head"><div><h3>Recommended follow-up</h3><p className="subtle">Start from the items that can delay operations or occupancy.</p></div></div><div className="mobile-cards" style={{display:"grid"}}>{[
      {title:"Review new complaints",detail:`${newComplaints??0} waiting for Admin confirmation and assignment.`,href:"/admin/complaints"},
      {title:"Clear pending material",detail:`${jobStages.find((item)=>item.name==="Pending Material")?.count??0} jobs may be blocked by material.`,href:"/admin/jobs?status=pending_material"},
      {title:"Update servicing & licences",detail:`${expired} expired and ${dueSoon} due within 30 days.`,href:"/admin/compliance"},
    ].map((item)=><article className="record-card" key={item.title}><strong>{item.title}</strong><div className="record-meta"><span>{item.detail}</span></div><Link className="text-link" href={item.href}>Open →</Link></article>)}</div></section>
    <section className="panel"><h3>Next improvement: AI document analysis</h3><p className="subtle">Later, Admin will upload Excel, PDF or photos. AI will create an editable preview of room/defect rows for batch import. Nothing will be assigned automatically until Admin confirms.</p></section>
  </AppShell>;
}
