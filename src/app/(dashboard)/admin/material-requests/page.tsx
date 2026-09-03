/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());

export default async function AdminMaterialRequestsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const query = await searchParams;
  const supabase = await createClient();
  const { data: requests, error } = await supabase.from("material_requests").select("id,request_no,status,note,rejection_reason,created_at,job:maintenance_jobs!job_id(job_no,room_no,block:blocks!block_id(code)),staff:profiles!requested_by(full_name),items:material_request_items(requested_qty,approved_qty,issued_qty,item:inventory_items(item_code,description,balance_qty,unit))").order("created_at", { ascending: false }).limit(100);
  const rows = requests || [];
  const pending = rows.filter((request: any) => request.status === "pending");
  const approved = rows.filter((request: any) => request.status === "approved");

  return <AppShell profile={profile} title="Material Requests">
    <div className="section-head inventory-heading"><div><p className="eyebrow">Material Control</p><h2>Material Requests</h2><p className="subtle">Review pending staff requests, approve stock and issue materials to jobs.</p></div></div>
    {query.error && <p className="error">{query.error}</p>}{query.success && <p className="success">Request updated successfully.</p>}{error && <p className="error">{error.message}</p>}

    <section className="material-request-kpis"><article><span>Pending Review</span><strong>{pending.length}</strong><small>Waiting for approval</small></article><article><span>Approved</span><strong>{approved.length}</strong><small>Ready to issue</small></article><article><span>Total Records</span><strong>{rows.length}</strong><small>Latest requests</small></article></section>

    <section className="material-request-list">{rows.length === 0 ? <div className="panel"><p className="dashboard-empty">No material requests yet.</p></div> : rows.map((request: any) => <article className={`panel request-card request-${request.status}`} key={request.id}>
      <div className="request-card-head"><div><div className="request-title-row"><strong>{request.request_no}</strong><span className={`status-badge status-${request.status}`}>{label(request.status)}</span></div><p>{request.job?.job_no || "No job"} · Block {request.job?.block?.code || "–"} · Room {request.job?.room_no || "–"}</p></div><div className="request-staff"><span>Requested by</span><strong>{request.staff?.full_name || "—"}</strong><small>{new Intl.DateTimeFormat("en-MY",{timeZone:"Asia/Kuala_Lumpur",day:"2-digit",month:"short",year:"numeric",hour:"numeric",minute:"2-digit",hour12:true}).format(new Date(request.created_at))}</small></div></div>
      {request.note && <div className="request-note"><span>Note</span><p>{request.note}</p></div>}
      <div className="table-wrap"><table className="table request-items-table"><thead><tr><th>Item Code</th><th>Material</th><th>Requested Qty</th><th>Approved Qty</th><th>Issued Qty</th><th>Current Stock</th></tr></thead><tbody>{(request.items || []).map((row: any) => <tr key={row.item?.item_code}><td><strong>{row.item?.item_code || "—"}</strong></td><td>{row.item?.description || "—"}</td><td>{row.requested_qty} {row.item?.unit || ""}</td><td>{row.approved_qty ?? "—"}</td><td>{row.issued_qty ?? "—"}</td><td><strong>{row.item?.balance_qty ?? "—"}</strong> {row.item?.unit || ""}</td></tr>)}</tbody></table></div>
      {request.rejection_reason && <p className="error request-reason">Rejected: {request.rejection_reason}</p>}
      {profile.role === "admin" && <div className="request-actions">{request.status === "pending" && <><form action="/admin/material-requests/action" method="post"><input type="hidden" name="requestId" value={request.id}/><input type="hidden" name="action" value="approve"/><button className="button" type="submit">Approve Request</button></form><form action="/admin/material-requests/action" method="post" className="reject-form"><input type="hidden" name="requestId" value={request.id}/><input type="hidden" name="action" value="reject"/><input name="reason" placeholder="Reason for rejection" required/><button className="button secondary" type="submit">Reject</button></form></>}{request.status === "approved" && <form action="/admin/material-requests/action" method="post"><input type="hidden" name="requestId" value={request.id}/><input type="hidden" name="action" value="issue"/><button className="button" type="submit">Issue Material</button></form>}</div>}
    </article>)}</section>
  </AppShell>;
}
