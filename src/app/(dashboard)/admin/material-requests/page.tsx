/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdminMaterialRequestsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const query = await searchParams;
  const supabase = await createClient();
  const { data: requests, error } = await supabase.from("material_requests").select("id,request_no,status,note,rejection_reason,created_at,job:maintenance_jobs!job_id(job_no,room_no,block:blocks!block_id(code)),staff:profiles!requested_by(full_name),items:material_request_items(requested_qty,approved_qty,issued_qty,item:inventory_items(item_code,description,balance_qty,unit))").order("created_at", { ascending: false }).limit(100);
  return <AppShell profile={profile} title="Material Requests">
    <div className="section-head"><div><p className="eyebrow">Phase 4</p><h2>Material Requests</h2><p className="subtle">Review staff requests and issue approved materials.</p></div></div>
    {query.error && <p className="error">{query.error}</p>}{query.success && <p className="success">Request updated successfully.</p>}{error && <p className="error">{error.message}</p>}
    <section className="panel list-panel">{(requests || []).length === 0 ? <p className="subtle">No material requests yet.</p> : (requests || []).map((request: any) => <article className="list-row" key={request.id}><div><div className="actions"><strong>{request.request_no}</strong><span className="badge">{request.status}</span></div><p>{request.job?.job_no} · Block {request.job?.block?.code} · {request.job?.room_no} · {request.staff?.full_name}</p>{request.note && <small>{request.note}</small>}<div>{(request.items || []).map((row: any) => <p key={row.item?.item_code}><strong>{row.item?.item_code}</strong> · {row.item?.description} — Requested {row.requested_qty} {row.item?.unit || ""} · Stock {row.item?.balance_qty}</p>)}</div>{request.rejection_reason && <p className="error">Rejected: {request.rejection_reason}</p>}</div>{profile.role === "admin" && <div className="actions">{request.status === "pending" && <><form action="/admin/material-requests/action" method="post"><input type="hidden" name="requestId" value={request.id}/><input type="hidden" name="action" value="approve"/><button className="button" type="submit">Approve</button></form><form action="/admin/material-requests/action" method="post"><input type="hidden" name="requestId" value={request.id}/><input type="hidden" name="action" value="reject"/><input name="reason" placeholder="Reject reason" required/><button type="submit">Reject</button></form></>}{request.status === "approved" && <form action="/admin/material-requests/action" method="post"><input type="hidden" name="requestId" value={request.id}/><input type="hidden" name="action" value="issue"/><button className="button" type="submit">Issue Material</button></form>}</div>}</article>)}</section>
  </AppShell>;
}
