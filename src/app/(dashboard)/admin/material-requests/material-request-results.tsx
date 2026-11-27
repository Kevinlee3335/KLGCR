/* eslint-disable @typescript-eslint/no-explicit-any */
import {materialLineStatus,materialRequestLabel} from "@/lib/material-request-state";
import { MaterialLineActions } from "@/components/material-line-actions";
import { MaterialRequestHistory } from "@/components/material-request-history";
import { MatchMaterialItem } from "@/components/match-material-item";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

const PAGE_SIZE = 25;
const requestDateTime = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric",
  hour: "numeric", minute: "2-digit", hour12: true,
});
const filters = [
  { status: "pending", label: "Pending Review", hint: "View requests waiting for approval" },
  { status: "approved", label: "Approved", hint: "View approved requests ready to issue" },
  { status: "all", label: "Total Records", hint: "View all requests" },
] as const;

export type RequestFilters = { status?: string; page?: string };

export async function MaterialRequestResults({ isAdmin, query }: { isAdmin: boolean; query: RequestFilters }) {
  const supabase = await createClient();
  const status = query.status === "pending" || query.status === "approved" ? query.status : "all";
  const pageCountFor = (count: number | null) => Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  function countRequests(filter: typeof status) {
    const query = supabase.from("material_requests").select("id", { count: "exact", head: true });
    return filter === "all" ? query : query.eq("status", filter);
  }
  function readPage(page: number, includeTotal: boolean) {
    let query = supabase.from("material_requests").select("id,request_no,status,note,rejection_reason,created_at,checkout:checkout_rooms!checkout_room_id(reference_no,room_no,block:blocks!block_id(code)),job:maintenance_jobs!job_id(job_no,room_no,block:blocks!block_id(code)),staff:profiles!requested_by(full_name),history:material_request_item_history(id,action,old_values,new_values,reason,created_at,actor:profiles!actor_id(full_name)),items:material_request_items(id,inventory_item_id,other_item_name,requested_qty,approved_qty,issued_qty,line_status,decision_reason,item:inventory_items(item_code,description,balance_qty,unit))", includeTotal ? { count: "exact" } : {});
    if (status !== "all") query = query.eq("status", status);
    return query.order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  }
  async function readSelection() {
    const requestedPage = Number(query.page);
    if (!Number.isSafeInteger(requestedPage) || requestedPage <= 1) {
      const result = await readPage(1, true);
      // A failed detail join must not suppress an otherwise readable summary.
      const total = result.error ? await countRequests(status) : result;
      return { page: 1, result, total };
    }
    const total = await countRequests(status);
    const page = Math.min(requestedPage, pageCountFor(total.count));
    return { page, result: await readPage(page, false), total };
  }
  const [selection, otherTotals] = await Promise.all([
    readSelection(),
    Promise.all(filters.map(filter => filter.status === status ? null : countRequests(filter.status))),
  ]);
  const { page, result: { data: requests, error }, total } = selection;
  const countResults = otherTotals.map(result => result ?? total);
  const selectedCount = total.count;
  const pageCount = pageCountFor(selectedCount);
  const rows = requests || [];
  const countError = countResults.find(result => result.error)?.error;
  const activeLabel = status === "all" ? "All Requests" : filters.find(filter => filter.status === status)!.label;
  const pageHref = (nextPage: number) => `/admin/material-requests?status=${status}&page=${nextPage}`;

  return <>
    {error && <p className="error">{error.message}</p>}
    {countError && <p className="error">Unable to load request totals. Please refresh.</p>}
    <nav className="material-request-kpis" aria-label="Filter material requests">{filters.map((filter, index) => <article key={filter.status}>
      <Link href={`/admin/material-requests?status=${filter.status}`} aria-current={status === filter.status ? "page" : undefined}>
        <span>{filter.label}</span><strong>{countResults[index].error ? "—" : countResults[index].count ?? "—"}</strong><small>{filter.hint}</small>
      </Link>
    </article>)}</nav>
    <div className="material-request-results"><h3>{activeLabel}</h3><p className="subtle">{selectedCount != null && !countError ? `${selectedCount} request${selectedCount === 1 ? "" : "s"} · ` : ""}Showing {rows.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{(page - 1) * PAGE_SIZE + rows.length}</p>{status !== "all" && <Link className="text-link" href="/admin/material-requests?status=all">Clear filter</Link>}</div>

    <section className="material-request-list" aria-label={activeLabel}>{error ? null : rows.length === 0 ? <div className="panel"><p className="dashboard-empty">{status === "pending" ? "No requests waiting for approval." : status === "approved" ? "No approved requests waiting to be issued." : "No material requests yet."}</p></div> : rows.map((request: any) => <article className={`panel request-card request-${request.status}`} key={request.id}>
      <div className="request-card-head"><div><div className="request-title-row"><strong>{request.request_no}</strong><span className={`status-badge status-${request.status}`}>{materialRequestLabel(request.status,request.items||[])}</span></div><p>{request.checkout?.reference_no || request.job?.job_no || "No job"} · Block {request.checkout?.block?.code || request.job?.block?.code || "–"} · Room {request.checkout?.room_no || request.job?.room_no || "–"}</p></div><div className="request-staff"><span>Requested by</span><strong>{request.staff?.full_name || "—"}</strong><small>{requestDateTime.format(new Date(request.created_at))}</small></div></div>
      {request.note && <div className="request-note"><span>Note</span><p>{request.note}</p></div>}
      <div className="table-wrap"><table className="table request-items-table"><thead><tr><th>Item Code</th><th>Material</th><th>Requested Qty</th><th>Approved Qty</th><th>Issued Qty</th><th>Current Stock</th><th>Status / Action</th></tr></thead><tbody>{(request.items || []).map((row: any) => <tr key={row.id}><td><strong>{row.item?.item_code || "—"}</strong></td><td>{row.item?.description || row.other_item_name || "—"}{row.other_item_name && row.item && <small>Requested: {row.other_item_name}</small>}{(!row.line_status || row.line_status === 'active') && !row.inventory_item_id && row.other_item_name && isAdmin && ["pending","approved"].includes(request.status) &&
        <MatchMaterialItem requestId={request.id} itemId={row.id} materialName={row.other_item_name}/>}</td><td>{row.requested_qty} {row.item?.unit || ""}</td><td>{row.approved_qty ?? "—"}</td><td>{row.issued_qty ?? "—"}</td><td><strong>{row.item?.balance_qty ?? "—"}</strong> {row.item?.unit || ""}</td><td><span className={`status-badge status-${materialLineStatus(row).toLowerCase()}`}>{request.status==='rejected' && (!row.line_status || row.line_status === 'active')?'Rejected':materialLineStatus(row)}</span>{row.decision_reason && <small className="material-decision-reason">{row.decision_reason}</small>}{isAdmin&&['pending','approved'].includes(request.status)&&<MaterialLineActions requestId={request.id} row={row}/>}</td></tr>)}</tbody></table></div>
      <MaterialRequestHistory history={request.history || []}/>
      {request.rejection_reason && <p className="error request-reason">Rejected: {request.rejection_reason}</p>}
      {isAdmin && (request.items||[]).some((item:any)=>Number(item.issued_qty)>0) && <form action="/admin/material-requests/action" method="post"><input type="hidden" name="action" value="sync"/><input type="hidden" name="requestId" value={request.id}/><button className="button secondary">Retry Google Sheet sync</button></form>}
      {isAdmin && <div className="request-actions">{request.status==='pending'&&!(request.items||[]).some((item:any)=>(!item.line_status || item.line_status==='active')&&(Number(item.approved_qty)>0||Number(item.issued_qty)>0))&&<form action="/admin/material-requests/action" method="post" className="reject-form"><input type="hidden" name="requestId" value={request.id}/><input type="hidden" name="action" value="reject"/><input name="reason" placeholder="Reason for rejection" required/><button className="button secondary">Reject Request</button></form>}{['pending','approved'].includes(request.status)&&(request.items||[]).some((item:any)=>(!item.line_status || item.line_status==='active')&&Number(item.approved_qty)>Number(item.issued_qty))&&<form action="/admin/material-requests/action" method="post"><input type="hidden" name="requestId" value={request.id}/><input type="hidden" name="action" value="issue"/><button className="button">Issue Approved Items</button></form>}</div>}

    </article>)}</section>
    {!error && pageCount > 1 && <nav className="material-request-pagination" aria-label="Material request pages">
      {page > 1 && <Link className="button secondary" href={pageHref(page - 1)}>Previous</Link>}
      <span>Page {page} of {pageCount}</span>
      {page < pageCount && <Link className="button secondary" href={pageHref(page + 1)}>Next</Link>}
    </nav>}
  </>;
}
