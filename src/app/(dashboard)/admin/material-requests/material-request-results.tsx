/* eslint-disable @typescript-eslint/no-explicit-any */
import {materialLineStatus,materialRequestLabel} from "@/lib/material-request-state";
import { MaterialLineActions } from "@/components/material-line-actions";
import { MaterialRequestHistory } from "@/components/material-request-history";
import { MatchMaterialItem } from "@/components/match-material-item";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Suspense } from "react";

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

type Status = typeof filters[number]["status"];
type Database = Awaited<ReturnType<typeof createClient>>;
type Total = { count: number | null; error: { message: string } | null };

function pageCountFor(count: number | null) {
  return Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
}

function countRequests(supabase: Database, status: Status) {
  const query = supabase.from("material_requests").select("id", { count: "exact", head: true });
  return status === "all" ? query : query.eq("status", status);
}

async function loadSelection(supabase: Database, status: Status, rawPage?: string) {
  function readPage(page: number) {
    let query = supabase.from("material_requests").select("id,request_no,status,note,rejection_reason,created_at,checkout:checkout_rooms!checkout_room_id(reference_no,room_no,block:blocks!block_id(code)),job:maintenance_jobs!job_id(job_no,room_no,block:blocks!block_id(code)),staff:profiles!requested_by(full_name),history:material_request_item_history(id,action,old_values,new_values,reason,created_at,actor:profiles!actor_id(full_name)),items:material_request_items(id,inventory_item_id,other_item_name,requested_qty,approved_qty,issued_qty,line_status,decision_reason,item:inventory_items(item_code,description,balance_qty,unit))", { count: "exact" });
    if (status !== "all") query = query.eq("status", status);
    return query.order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  }
  const number = Number(rawPage);
  const requested = Number.isSafeInteger(number) && number > 1 ? number : 1;
  let knownTotal: Total | undefined;
  if (Number.isSafeInteger(requested * PAGE_SIZE)) {
    const result = await readPage(requested);
    // PostgREST returns PGRST103 when the requested offset is beyond the last row.
    const outOfRange = requested > 1 && (result.error?.code === "PGRST103" || (!result.error && !result.data?.length));
    if (!outOfRange) {
      const total = result.error ? await countRequests(supabase, status) : result;
      return { page: requested, result, total };
    }
    if (result.count !== null) knownTotal = result;
  }
  const total = knownTotal ?? await countRequests(supabase, status);
  const page = Math.min(requested, pageCountFor(total.count));
  return { page, result: await readPage(page), total };
}

export function MaterialRequestResults({ isAdmin, query }: { isAdmin: boolean; query: RequestFilters }) {
  const status = query.status === "pending" || query.status === "approved" ? query.status : "all";
  const client = createClient();
  const selection = client.then(db => loadSelection(db, status, query.page));
  const totals = filters.map(filter => filter.status === status
    ? selection.then(({ total }) => total)
    : client.then(db => countRequests(db, filter.status)));
  return <>
    <Suspense fallback={null}><TotalsError totals={totals}/></Suspense>
    <nav className="material-request-kpis" aria-label="Filter material requests">
      {filters.map((filter, index) => <article key={filter.status}>
        <Link href={`/admin/material-requests?status=${filter.status}`} aria-current={status === filter.status ? "page" : undefined}>
          <span>{filter.label}</span><strong><Suspense fallback={<span aria-busy="true">—</span>}>
            <RequestCount total={totals[index]}/>
          </Suspense></strong><small>{filter.hint}</small>
        </Link>
      </article>)}
    </nav>
    <Suspense fallback={<div className="panel" role="status" aria-busy="true"><p className="subtle">Loading material requests…</p></div>}>
      <RequestList selection={selection} isAdmin={isAdmin} status={status}/>
    </Suspense>
  </>;
}

async function RequestCount({ total }: { total: Promise<Total> }) {
  const { count, error } = await total;
  return error ? "—" : count ?? "—";
}

async function TotalsError({ totals }: { totals: Promise<Total>[] }) {
  const counts = await Promise.all(totals);
  return counts.some(result => result.error) ? <p className="error">Unable to load request totals. Please refresh.</p> : null;
}

async function RequestList({ selection, status, isAdmin }: {
  selection: ReturnType<typeof loadSelection>; status: Status; isAdmin: boolean;
}) {
  const { page, result: { data: requests, error }, total } = await selection;
  const selectedCount = total.count;
  const pageCount = pageCountFor(selectedCount);
  const rows = requests || [];
  const activeLabel = status === "all" ? "All Requests" : filters.find(filter => filter.status === status)!.label;
  const pageHref = (nextPage: number) => `/admin/material-requests?status=${status}&page=${nextPage}`;

  return <>
    {error && <p className="error">{error.message}</p>}
    <div className="material-request-results"><h3>{activeLabel}</h3><p className="subtle">{selectedCount != null && !total.error ? `${selectedCount} request${selectedCount === 1 ? "" : "s"} · ` : ""}Showing {rows.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{(page - 1) * PAGE_SIZE + rows.length}</p>{status !== "all" && <Link className="text-link" href="/admin/material-requests?status=all">Clear filter</Link>}</div>

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
