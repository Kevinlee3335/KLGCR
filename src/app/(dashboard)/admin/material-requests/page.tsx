/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());

export default async function AdminMaterialRequestsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const query = await searchParams;
  const supabase = await createClient();
  const { data: requests, error } = await supabase.from("material_requests").select("id,request_no,status,note,rejection_reason,created_at,job:maintenance_jobs!job_id(job_no,room_no,block:blocks!block_id(code)),staff:profiles!requested_by(full_name),items:material_request_items(id,other_item_name,requested_qty,approved_qty,issued_qty,item:inventory_items(item_code,description,balance_qty,unit))").order("created_at", { ascending: false }).limit(100);
  const rows = requests || [];
  const {data:inventory} = await supabase.from("inventory_items").select("id,item_code,description").eq("is_active",true).order("item_code");
  const pending = rows.filter((request: any) => request.status === "pending");
  const approved = rows.filter((request: any) => request.status === "approved");

  return <AppShell profile={profile} title="Material Requests">
    <div className="section-head inventory-heading"><div><p className="eyebrow">Material Control</p><h2>Material Requests</h2><p className="subtle">Review pending staff requests, approve stock and issue materials to jobs.</p></div></div>
    {query.error && <p className="error">{query.error}</p>}{query.success && <p className="success">Request updated successfully.</p>}{error && <p className="error">{error.message}</p>}

    <section className="material-request-kpis"><article><span>Pending Review</span><strong>{pending.length}</strong><small>Waiting for approval</small></article><article><span>Approved</span><strong>{approved.length}</strong><small>Ready to issue</small></article><article><span>Total Records</span><strong>{rows.length}</strong><small>Latest requests</small></article></section>

    <section className="material-request-list">{rows.length === 0 ? <div className="panel"><p className="dashboard-empty">No material requests yet.</p></div> : rows.map((request: any) => <article className={`panel request-card request-${request.status}`} key={request.id}>
      <div className="request-card-head"><div><div className="request-title-row"><strong>{request.request_no}</strong><span className={`status-badge status-${request.status}`}>{label(request.status)}</span></div><p>{request.job?.job_no || "No job"} · Block {request.job?.block?.code || "–"} · Room {request.job?.room_no || "–"}</p></div><div className="request-staff"><span>Requested by</span><strong>{request.staff?.full_name || "—"}</strong><small>{new Intl.DateTimeFormat("en-MY",{timeZone:"Asia/Kuala_Lumpur",day:"2-digit",month:"short",year:"numeric",hour:"numeric",minute:"2-digit",hour12:true}).format(new Date(request.created_at))}</small></div></div>
      {request.note && <div className="request-note"><span>Note</span><p>{request.note}</p></div>}
      <div className="table-wrap"><table className="table request-items-table"><thead><tr><th>Item Code</th><th>Material</th><th>Requested Qty</th><th>Approved Qty</th><th>Issued Qty</th><th>Current Stock</th></tr></thead><tbody>{(request.items || []).map((row: any) => <tr key={row.id}><td><strong>{row.item?.item_code || "—"}</strong></td><td>{row.item?.description || row.other_item_name || "—"}{row.other_item_name && row.item && <small>Requested: {row.other_item_name}</small>}{!row.item && profile.role === "admin" && ["pending","approved"].includes(request.status) && <form action="/admin/material-requests/action" method="post"><input type="hidden" name="action" value="match_other"/><input type="hidden" name="requestId" value={request.id}/><input type="hidden" name="requestItemId" value={row.id}/><select name="inventoryItemId" required defaultValue=""><option value="">Match purchased item to stock</option>{inventory?.map(item=><option key={item.id} value={item.id}>{item.item_code} · {item.description}</option>)}</select><button className="button secondary">Match item</button></form>}</td><td>{row.requested_qty} {row.item?.unit || ""}</td><td>{row.approved_qty ?? "—"}</td><td>{row.issued_qty ?? "—"}</td><td><strong>{row.item?.balance_qty ?? "—"}</strong> {row.item?.unit || ""}</td></tr>)}</tbody></table></div>
      {request.rejection_reason && <p className="error request-reason">Rejected: {request.rejection_reason}</p>}
      {profile.role === "admin" && request.status === "issued" && <form action="/admin/material-requests/action" method="post"><input type="hidden" name="action" value="sync"/><input type="hidden" name="requestId" value={request.id}/><button className="button secondary">Retry Google Sheet sync</button></form>}
      {profile.role === "admin" && <div className="request-actions">{request.status === "pending" && <><form action="/admin/material-requests/action" method="post"><input type="hidden" name="requestId" value={request.id}/><input type="hidden" name="action" value="approve"/><button className="button" type="submit">Approve Request</button></form><form action="/admin/material-requests/action" method="post" className="reject-form"><input type="hidden" name="requestId" value={request.id}/><input type="hidden" name="action" value="reject"/><input name="reason" placeholder="Reason for rejection" required/><button className="button secondary" type="submit">Reject</button></form></>}{request.status === "approved" && <form action="/admin/material-requests/action" method="post"><input type="hidden" name="requestId" value={request.id}/><input type="hidden" name="action" value="issue"/><button className="button" type="submit">Issue Material</button></form>}</div>}
    </article>)}</section>
  </AppShell>;
}
