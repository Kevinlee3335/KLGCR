/* eslint-disable @typescript-eslint/no-explicit-any */
import { Suspense } from "react";
import { MaterialRequestHistory } from "@/components/material-request-history";
import { DirectPageLink } from "@/components/direct-page-link";
import {materialLineStatus,materialRequestLabel} from "@/lib/material-request-state";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getStaffMaterialCatalog, type MaterialItem } from "@/lib/staff-material-catalog";
import { MaterialRequestRows } from "@/components/material-request-rows";


type RequestQuery = { job?: string; checkout?: string; error?: string; success?: string };

export default async function StaffMaterialRequestPage({ searchParams }: { searchParams: Promise<RequestQuery> }) {
  const profile = await requireRole(["maintenance_staff"]);
  const query = await searchParams;
  return <AppShell profile={profile} title="Material Request">
    <div className="section-head material-page-heading">
      <div><p className="eyebrow">Materials</p><h2>Material Request</h2><p className="subtle">Select an active job and add the materials you need.</p></div>
    </div>

    <Suspense fallback={<div className="panel subtle" role="status">Loading active jobs…</div>}>
      <NewRequestForm staffId={profile.id} query={query} catalog={getStaffMaterialCatalog()}/>
    </Suspense>
    <section className="material-history" aria-labelledby="recent-material-requests-heading">
      <div className="material-section-heading"><h2 id="recent-material-requests-heading">My Recent Requests</h2><p>Track requested and issued quantities for your latest submissions.</p></div>
      <Suspense fallback={<p className="subtle" role="status">Loading recent requests…</p>}>
        <RecentRequests staffId={profile.id}/>
      </Suspense>
    </section>
    <p className="material-pending-link"><DirectPageLink className="text-link" href="/staff/tasks?status=pending_material">View Pending Material jobs</DirectPageLink></p>
  </AppShell>;
}

async function NewRequestForm({ staffId, query, catalog }: {
  staffId: string;
  query: RequestQuery;
  catalog: Promise<MaterialItem[] | null>;
}) {
  const supabase = await createClient();
  const [{ data: jobs }, { data: checkouts }] = await Promise.all([
    supabase.from("maintenance_jobs").select("id,job_no,room_no,status,block:blocks!block_id(code)").eq("assigned_to", staffId).in("status", ["in_progress", "pending_material"]).order("assigned_at", { ascending: false }),
    supabase.from("checkout_rooms").select("id,reference_no,room_no,block:blocks!block_id(code)").eq("assigned_to",staffId).eq("status","rectification").is("deleted_at",null).order("created_at",{ascending:false}),
  ]);

  return <section className="panel material-request-form-card" aria-labelledby="new-material-request-heading">
      <header className="material-section-heading"><h3 id="new-material-request-heading">New Material Request</h3><p>Select the job, choose the required materials, and enter the quantities needed.</p></header>
      {query.error && <p className="error" role="alert">{query.error}</p>}
      {query.success && <p className="success" role="status">Material request submitted successfully.</p>}
      <form action="/staff/material-request/submit" method="post" className="material-request-form">
        <label className="material-field material-job-field"><span>Job</span><select name="jobId" defaultValue={query.checkout ? `checkout:${query.checkout}` : query.job || ""} required><option value="">Select an active job</option>{(jobs || []).map((job: any) => <option key={job.id} value={job.id}>{job.job_no} · Block {job.block?.code} · Room {job.room_no}</option>)}{(checkouts||[]).map((room:any)=><option key={room.id} value={`checkout:${room.id}`}>{room.reference_no} · Check-out · Block {room.block?.code} · Room {room.room_no}</option>)}</select></label>

        <MaterialRequestRows catalog={catalog}/>

        <label className="material-field material-note-field"><span>Reason / Note</span><small>Briefly explain why these materials are needed.</small><textarea name="note" rows={4} placeholder="Enter a short reason or note"/></label>
        <div className="material-submit"><button className="button" type="submit">Submit Request</button></div>
      </form>
    </section>;
}

async function RecentRequests({ staffId }: { staffId: string }) {
  const supabase = await createClient();
  const { data: requests, error } = await supabase.from("material_requests").select("id,request_no,status,note,rejection_reason,checkout:checkout_rooms!checkout_room_id(reference_no,room_no),job:maintenance_jobs!job_id(id,job_no,room_no,status),history:material_request_item_history(id,action,old_values,new_values,reason,created_at,actor:profiles!actor_id(full_name)),items:material_request_items(other_item_name,requested_qty,approved_qty,issued_qty,line_status,decision_reason,item:inventory_items(item_code,description,unit))").eq("requested_by", staffId).order("created_at", { ascending: false }).limit(20);
  if (error) return <p className="error" role="alert">Unable to load recent requests. Please refresh to try again.</p>;

  return <div className="material-request-list staff-material-request-list">
        {(requests || []).length === 0 ? <div className="panel material-empty"><strong>No recent material requests yet.</strong><p>Submitted requests will appear here.</p></div> : (requests || []).map((request: any) => <article className={`panel staff-request-card request-${request.status}`} key={request.id}>
          <header className="staff-request-head"><div><div className="request-title-row"><strong>{request.request_no}</strong><span className={`status-badge status-${request.status}`}>{materialRequestLabel(request.status,request.items||[])}</span></div><p><strong>{request.checkout?.reference_no || request.job?.job_no || "No job"}</strong><span>Room {request.checkout?.room_no || request.job?.room_no || "–"}</span></p></div></header>
          <div className="staff-request-items">{(request.items || []).map((row: any, index: number) => <div className="staff-request-item" key={`${request.id}-${index}`}><div><strong>{row.item?.item_code || "—"}</strong><span>{row.item?.description || row.other_item_name || "Material description unavailable"}</span><small>{request.status==='rejected' && (!row.line_status || row.line_status==='active')?'Rejected':materialLineStatus(row)}{row.decision_reason && <> · {row.decision_reason}</>}</small></div><dl>{Number(row.approved_qty)>0&&<div><dt>Approved</dt><dd>{row.approved_qty}</dd></div>}<div><dt>Requested</dt><dd>{row.requested_qty} {row.item?.unit || ""}</dd></div>{row.issued_qty != null && <div><dt>Issued</dt><dd>{row.issued_qty} {row.item?.unit || ""}</dd></div>}</dl></div>)}</div>
          <MaterialRequestHistory history={request.history || []}/>
          {request.note && <div className="staff-request-note"><span>Reason / Note</span><p>{request.note}</p></div>}
          {request.rejection_reason && <p className="error staff-request-error">Rejected: {request.rejection_reason}</p>}
          {request.status === "issued" && request.job?.status === "pending_material" && <div className="staff-resume-action"><div><strong>Materials issued</strong><span>The job is ready to continue.</span></div><DirectPageLink className="button button-link" href={`/staff/jobs/${request.job.id}`}>Open Job to Resume</DirectPageLink></div>}
        </article>)}
      </div>;
}
