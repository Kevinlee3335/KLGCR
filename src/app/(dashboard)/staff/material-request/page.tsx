/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MaterialAutocomplete, type MaterialSearchItem } from "@/components/material-autocomplete";

const statusLabel = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default async function StaffMaterialRequestPage({ searchParams }: { searchParams: Promise<{ job?: string; error?: string; success?: string }> }) {
  const profile = await requireRole(["maintenance_staff"]);
  const query = await searchParams;
  const supabase = await createClient();
  const [{ data: jobs }, { data: items }, { data: requests }] = await Promise.all([
    supabase.from("maintenance_jobs").select("id,job_no,room_no,status,block:blocks!block_id(code)").in("status", ["in_progress", "pending_material"]).order("assigned_at", { ascending: false }),
    supabase.from("inventory_items").select("id,item_code,description,balance_qty,unit").eq("is_active", true).order("description"),
    supabase.from("material_requests").select("id,request_no,status,note,rejection_reason,created_at,issued_at,job:maintenance_jobs!job_id(id,job_no,room_no,status),items:material_request_items(requested_qty,approved_qty,issued_qty,item:inventory_items(item_code,description,unit))").order("created_at", { ascending: false }).limit(20),
  ]);
  const materialItems = (items || []) as MaterialSearchItem[];

  return <AppShell profile={profile} title="Material Request">
    <div className="section-head material-page-heading">
      <div><p className="eyebrow">Materials</p><h2>Material Request</h2><p className="subtle">Select an active job and request up to three materials.</p></div>
    </div>

    <section className="panel material-request-form-card" aria-labelledby="new-material-request-heading">
      <header className="material-section-heading"><h3 id="new-material-request-heading">New Material Request</h3><p>Select the job, choose the required materials, and enter the quantities needed.</p></header>
      {query.error && <p className="error" role="alert">{query.error}</p>}
      {query.success && <p className="success" role="status">Material request submitted successfully.</p>}
      <form action="/staff/material-request/submit" method="post" className="material-request-form">
        <label className="material-field material-job-field"><span>Job</span><select name="jobId" defaultValue={query.job || ""} required><option value="">Select an active job</option>{(jobs || []).map((job: any) => <option key={job.id} value={job.id}>{job.job_no} · Block {job.block?.code} · Room {job.room_no}</option>)}</select></label>

        <div className="material-rows">
          {[1, 2, 3].map((slot) => <fieldset className="material-row" key={slot}>
            <legend>Material {slot}{slot > 1 && <span>Optional</span>}</legend>
            <MaterialAutocomplete items={materialItems} slot={slot} required={slot === 1}/>
            <label className="material-field material-quantity-field"><span>Quantity</span><input name="qty" type="number" inputMode="decimal" min="0.01" step="0.01" required={slot === 1}/></label>
          </fieldset>)}
        </div>

        <label className="material-field material-note-field"><span>Reason / Note</span><small>Briefly explain why these materials are needed.</small><textarea name="note" rows={4} placeholder="Enter a short reason or note"/></label>
        <div className="material-submit"><button className="button" type="submit">Submit Request</button></div>
      </form>
    </section>

    <section className="material-history" aria-labelledby="recent-material-requests-heading">
      <div className="material-section-heading"><h2 id="recent-material-requests-heading">My Recent Requests</h2><p>Track requested and issued quantities for your latest submissions.</p></div>
      <div className="material-request-list staff-material-request-list">
        {(requests || []).length === 0 ? <div className="panel material-empty"><strong>No recent material requests yet.</strong><p>Submitted requests will appear here.</p></div> : (requests || []).map((request: any) => <article className={`panel staff-request-card request-${request.status}`} key={request.id}>
          <header className="staff-request-head"><div><div className="request-title-row"><strong>{request.request_no}</strong><span className={`status-badge status-${request.status}`}>{statusLabel(request.status)}</span></div><p><strong>{request.job?.job_no || "No job"}</strong><span>Room {request.job?.room_no || "–"}</span></p></div></header>
          <div className="staff-request-items">{(request.items || []).map((row: any, index: number) => <div className="staff-request-item" key={`${request.id}-${index}`}><div><strong>{row.item?.item_code || "—"}</strong><span>{row.item?.description || "Material description unavailable"}</span></div><dl><div><dt>Requested</dt><dd>{row.requested_qty} {row.item?.unit || ""}</dd></div>{row.issued_qty != null && <div><dt>Issued</dt><dd>{row.issued_qty} {row.item?.unit || ""}</dd></div>}</dl></div>)}</div>
          {request.note && <div className="staff-request-note"><span>Reason / Note</span><p>{request.note}</p></div>}
          {request.rejection_reason && <p className="error staff-request-error">Rejected: {request.rejection_reason}</p>}
          {request.status === "issued" && request.job?.status === "pending_material" && <div className="staff-resume-action"><div><strong>Materials issued</strong><span>The job is ready to continue.</span></div><Link className="button button-link" href={`/staff/jobs/${request.job.id}`}>Open Job to Resume</Link></div>}
        </article>)}
      </div>
    </section>
    <p className="material-pending-link"><Link className="text-link" href="/staff/tasks?status=pending_material">View Pending Material jobs</Link></p>
  </AppShell>;
}
