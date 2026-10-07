import Link from "next/link";
import { ComplaintSummary } from "@/components/complaint-summary";
import { AppShell } from "@/components/app-shell";
import { ComplaintList, PriorityBadge, StatusBadge } from "@/components/phase2-ui";
import { requireRole } from "@/lib/auth";
import { complaintStatuses, formatDate, priorities, sources, titleCase, type ComplaintRow } from "@/lib/phase2";
import { createClient } from "@/lib/supabase/server";

type DeletedComplaint = {
  id: string;
  complaint_no: string;
  block_id: number | null;
  room_no: string | null;
  category: string | null;
  description: string | null;
  priority: string;
  submitted_at: string | null;
  deleted_at: string;
  deleted_by_name: string | null;
};

function DeletedComplaintList({ rows, blocks }: { rows: DeletedComplaint[]; blocks: { id: number; code: string }[] }) {
  if (!rows.length) return <div className="empty"><div><strong>No deleted complaints found</strong><span>Deleted complaints will be kept here for reference.</span></div></div>;
  const location = (row: DeletedComplaint) => {
    const block = blocks.find((item) => item.id === row.block_id);
    return block ? `Block ${block.code} · ${row.room_no || "—"}` : row.room_no || "External Area";
  };
  return <><div className="desktop-table"><table className="table"><thead><tr><th>Complaint</th><th>Location</th><th>Category / description</th><th>Source</th><th>Priority</th><th>Submitted</th><th>Status</th><th>Deleted by</th><th>Deleted</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.complaint_no}</td><td>{location(row)}</td><td><strong>{row.category || "—"}</strong><br /><span className="truncate">{row.description || "—"}</span></td><td>Archived</td><td><PriorityBadge value={row.priority} /></td><td>{row.submitted_at ? formatDate(row.submitted_at) : "—"}</td><td><StatusBadge value="deleted" /></td><td>{row.deleted_by_name || "—"}</td><td>{formatDate(row.deleted_at)}</td></tr>)}</tbody></table></div><div className="mobile-cards">{rows.map((row) => <article className="panel record-card" key={row.id}><div className="record-head"><strong>{row.complaint_no}</strong><StatusBadge value="deleted" /></div><h3>{location(row)}</h3><p>{row.category || "—"} — {row.description || "—"}</p><div className="record-meta"><PriorityBadge value={row.priority} /><span>Deleted by {row.deleted_by_name || "—"} · {formatDate(row.deleted_at)}</span></div></article>)}</div></>;
}

export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const q = await searchParams;
  const supabase = await createClient();
  const isDeleted = q.status === "deleted";
  let activeQuery = supabase.from("complaints").select("id,complaint_no,source,source_reference,room_no,complainant_name,complainant_contact,category,description,priority,status,submitted_at,assigned_at,availability_date,availability_time,room_access_permission,block:blocks!block_id(id,code),assignee:profiles!assigned_to(id,full_name)").order("submitted_at", { ascending: false });
  let deletedQuery = supabase.from("deleted_complaints").select("id,complaint_no,block_id,room_no,category,description,priority,submitted_at,deleted_at,deleted_by_name").order("deleted_at", { ascending: false });

  if (isDeleted) {
    if (q.block) deletedQuery = deletedQuery.eq("block_id", q.block);
    if (q.priority) deletedQuery = deletedQuery.eq("priority", q.priority);
    if (q.date) deletedQuery = deletedQuery.gte("submitted_at", `${q.date}T00:00:00`).lt("submitted_at", `${q.date}T23:59:59.999`);
    if (q.search) deletedQuery = deletedQuery.or(`complaint_no.ilike.%${q.search}%,room_no.ilike.%${q.search}%,description.ilike.%${q.search}%`);
  } else {
    if (q.status) activeQuery = activeQuery.eq("status", q.status);
    if (q.needAppointment) activeQuery = activeQuery.eq("need_appointment", true);
    if (q.block) activeQuery = activeQuery.eq("block_id", q.block);
    if (q.priority) activeQuery = activeQuery.eq("priority", q.priority);
    if (q.source) activeQuery = activeQuery.eq("source", q.source);
    if (q.date) activeQuery = activeQuery.gte("submitted_at", `${q.date}T00:00:00`).lt("submitted_at", `${q.date}T23:59:59.999`);
    if (q.search) activeQuery = activeQuery.or(`complaint_no.ilike.%${q.search}%,room_no.ilike.%${q.search}%,description.ilike.%${q.search}%,complainant_name.ilike.%${q.search}%`);
  }

  const [{ data, error }, { data: deletedRows, error: deletedError }, { data: blocks }, { count: newCount }, { count: reviewCount }, { count: assignedToday }, { count: urgentCount }] = await Promise.all([
    isDeleted ? activeQuery.limit(0) : activeQuery,
    isDeleted ? deletedQuery : deletedQuery.limit(0),
    supabase.from("blocks").select("id,code").order("code"),
    supabase.from("complaints").select("*", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("complaints").select("*", { count: "exact", head: true }).eq("status", "under_review"),
    supabase.from("complaints").select("*", { count: "exact", head: true }).eq("status", "assigned").gte("assigned_at", new Date().toISOString().slice(0, 10)),
    supabase.from("complaints").select("*", { count: "exact", head: true }).eq("priority", "urgent").not("status", "in", "(rejected,closed)"),
  ]);
  const resultError = isDeleted ? deletedError : error;
  const statusOptions = [...complaintStatuses, "deleted"];

  return <AppShell profile={profile} title="New Complaints"><div className="section-head"><div><h2>Complaint intake</h2><p className="subtle">Review, prioritise and assign incoming requests.</p></div>{profile.role === "admin" && <Link className="button button-link" href="/admin/complaints/new">Add complaint</Link>}</div><section className="metrics compact">{[["New", newCount], ["Under review", reviewCount], ["Assigned today", assignedToday], ["Urgent", urgentCount]].map(([label, value]) => <article className="panel metric" key={String(label)}><span className="subtle">{label}</span><div className="value">{value || 0}</div></article>)}</section><ComplaintSummary from={q.summaryFrom} to={q.summaryTo} block={q.block} blocks={blocks || []} filters={q} /><form className="panel filter-bar">{q.summaryFrom && <input type="hidden" name="summaryFrom" value={q.summaryFrom} />}{q.summaryTo && <input type="hidden" name="summaryTo" value={q.summaryTo} />}<input name="search" defaultValue={q.search} placeholder="Search complaint, room, name…" /><select name="status" defaultValue={q.status || ""}><option value="">All statuses</option>{statusOptions.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select><select name="block" defaultValue={q.block || ""}><option value="">All blocks</option>{blocks?.map((block) => <option key={block.id} value={block.id}>Block {block.code}</option>)}</select><select name="priority" defaultValue={q.priority || ""}><option value="">All priorities</option>{priorities.map((priority) => <option key={priority} value={priority}>{titleCase(priority)}</option>)}</select><select name="source" defaultValue={q.source || ""} disabled={isDeleted}><option value="">All sources</option>{sources.map((source) => <option key={source} value={source}>{titleCase(source)}</option>)}</select><input type="date" name="date" defaultValue={q.date} /><button className="button">Filter</button></form>{q.deleted && <p className="success">Complaint deleted.</p>}<section className="panel list-panel">{resultError ? <p className="error">{resultError.message}</p> : isDeleted ? <DeletedComplaintList rows={(deletedRows || []) as DeletedComplaint[]} blocks={blocks || []} /> : <ComplaintList rows={(data || []) as unknown as ComplaintRow[]} canDelete={profile.role === "admin"} />}</section></AppShell>;
}
