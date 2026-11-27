import { parseRoomSearch, roomSearchFilter } from "@/lib/room-search";
import { Suspense } from "react";
import Link from "next/link";
import { ComplaintSummary } from "@/components/complaint-summary";
import { AppShell } from "@/components/app-shell";
import { ComplaintList, PriorityBadge, StatusBadge } from "@/components/phase2-ui";
import { ColumnFilter, DateColumnFilter, StatusColumnFilter, type PreservedValue } from "@/components/status-column-filter";
import { requireRole } from "@/lib/auth";
import { complaintStatuses, formatDate, priorities, sources, titleCase, type ComplaintRow } from "@/lib/phase2";
import { createClient } from "@/lib/supabase/server";

const complaintSortOptions = [
  ["submitted_at:desc", "Submitted time · Descending"],
  ["submitted_at:asc", "Submitted time · Ascending"],
  ["status:asc", "Status · Ascending (A–Z)"],
  ["status:desc", "Status · Descending (Z–A)"],
] as const;
const PAGE_SIZE = 50;

function selectedComplaintSort(filters: Record<string, string | undefined>) {
  if (complaintSortOptions.some(([value]) => value === filters.sort)) {
    const [sortBy, direction] = filters.sort!.split(":");
    return { value: filters.sort!, sortBy, ascending: direction === "asc" };
  }
  return { value: "submitted_at:desc", sortBy: "submitted_at", ascending: false };
}

function selectedComplaintStatuses(filters: Record<string, string | undefined>) {
  const checkedStatuses = complaintStatuses.filter((status) => filters[`status_${status}`] === status);
  if (checkedStatuses.length) return checkedStatuses as string[];
  return complaintStatuses.includes(filters.status as typeof complaintStatuses[number]) ? [filters.status!] : [];
}

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
  return <><div className="desktop-table table-wrap" role="region" aria-label="Deleted complaints table" tabIndex={0}><table className="table"><thead><tr><th>Complaint</th><th>Location</th><th>Category / description</th><th>Source</th><th>Priority</th><th>Submitted</th><th>Status</th><th>Deleted by</th><th>Deleted</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.complaint_no}</td><td>{location(row)}</td><td><strong>{row.category || "—"}</strong><br /><span className="truncate">{row.description || "—"}</span></td><td>Archived</td><td><PriorityBadge value={row.priority} /></td><td>{row.submitted_at ? formatDate(row.submitted_at) : "—"}</td><td><StatusBadge value="deleted" /></td><td>{row.deleted_by_name || "—"}</td><td>{formatDate(row.deleted_at)}</td></tr>)}</tbody></table></div><div className="mobile-cards">{rows.map((row) => <article className="panel record-card" key={row.id}><div className="record-head"><strong>{row.complaint_no}</strong><StatusBadge value="deleted" /></div><h3>{location(row)}</h3><p>{row.category || "—"} — {row.description || "—"}</p><div className="record-meta"><PriorityBadge value={row.priority} /><span>Deleted by {row.deleted_by_name || "—"} · {formatDate(row.deleted_at)}</span></div></article>)}</div></>;
}

type Filters = Record<string, string | undefined>;
type Database = Awaited<ReturnType<typeof createClient>>;

async function getBlocks(db: Database) {
  return await db.from("blocks").select("id,code").order("code");
}
type BlocksRequest = ReturnType<typeof getBlocks>;

async function resolveFilters(input: Filters, blocks: BlocksRequest): Promise<Filters> {
  const room = parseRoomSearch(input.search);
  if (!room) return input;
  const { data, error } = await blocks;
  if (error) throw new Error(error.message);
  const block = data?.find(row => row.code.toUpperCase() === room.blockCode);
  // An unknown block must never broaden the search to other buildings.
  return { ...input, block: block?.id || "00000000-0000-0000-0000-000000000000" };
}

export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const [supabase, input] = await Promise.all([createClient(), searchParams]);
  const blocks = getBlocks(supabase);
  const filters = resolveFilters(input, blocks);
  return <AppShell profile={profile} title="New Complaints">
    <div className="section-head">
      <div><h2>Complaint intake</h2><p className="subtle">Review, prioritise and assign incoming requests.</p></div>
      {profile.role === "admin" && <Link className="button button-link" href="/admin/complaints/new">Add complaint</Link>}
    </div>
    <Suspense fallback={<MetricCards/>}>
      <ComplaintMetrics supabase={supabase}/>
    </Suspense>
    <Suspense fallback={<p className="subtle" role="status">Loading report summary…</p>}>
      <ReportSummary filters={filters} blocks={blocks}/>
    </Suspense>
    <Suspense fallback={<p className="subtle" role="status">Loading filters…</p>}>
      <ComplaintFilters filters={filters} blocks={blocks}/>
    </Suspense>
    {input.deleted && <p className="success">Complaint deleted.</p>}
    <Suspense key={JSON.stringify(input)} fallback={<p className="panel subtle" role="status">Loading complaints…</p>}>
      <ComplaintResults supabase={supabase} filters={filters} blocks={blocks} canDelete={profile.role === "admin"}/>
    </Suspense>
  </AppShell>;
}

async function ComplaintMetrics({ supabase }: { supabase: Database }) {
  const [{ count: newCount }, { count: reviewCount }, { count: kivCount }, { count: assignedToday }, { count: urgentCount }] = await Promise.all([
    supabase.from("complaints").select("*", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("complaints").select("*", { count: "exact", head: true }).eq("status", "under_review"),
    supabase.from("complaints").select("*", { count: "exact", head: true }).eq("status", "kiv"),
    supabase.from("complaints").select("*", { count: "exact", head: true }).eq("status", "assigned").gte("assigned_at", new Date().toISOString().slice(0, 10)),
    supabase.from("complaints").select("*", { count: "exact", head: true }).eq("priority", "urgent").not("status", "in", "(rejected,closed)"),
  ]);
  return <MetricCards counts={[newCount, reviewCount, kivCount, assignedToday, urgentCount]}/>;
}

function MetricCards({ counts }: { counts?: (number | null)[] }) {
  return <section className="metrics compact complaint-intake-metrics" aria-label="Complaint totals" aria-busy={!counts}>
    {["New", "Under review", "KIV", "Assigned today", "Urgent"].map((label, i) => (
      <article className="panel metric" key={label}><span className="subtle">{label}</span><div className="value">{counts ? counts[i] ?? 0 : "—"}</div></article>
    ))}
  </section>;
}

type FilterContext = { filters: Promise<Filters>; blocks: BlocksRequest };

async function ReportSummary({ filters, blocks }: FilterContext) {
  const [q, { data }] = await Promise.all([filters, blocks]);
  return <ComplaintSummary from={q.summaryFrom} to={q.summaryTo} block={q.block} blocks={data || []} filters={q}/>;
}

async function BlockSelect({ blocks, selected }: { blocks: BlocksRequest; selected?: string }) {
  const { data } = await blocks;
  return <select aria-label="Block" name="block" defaultValue={selected || ""}>
    <option value="">All blocks</option>{data?.map(row => <option key={row.id} value={row.id}>Block {row.code}</option>)}
  </select>;
}

async function ComplaintFilters({ filters, blocks }: FilterContext) {
  const q = await filters;
  const isDeleted = q.status === "deleted";
  const sort = selectedComplaintSort(q);
  return <form className="panel filter-bar">
      {q.summaryFrom && <input type="hidden" name="summaryFrom" value={q.summaryFrom} />}
      {q.summaryTo && <input type="hidden" name="summaryTo" value={q.summaryTo} />}
      {!isDeleted && <input type="hidden" name="sort" value={sort.value} />}
      {q.category && <input type="hidden" name="category" value={q.category} />}
      {q.assigned && <input type="hidden" name="assigned" value={q.assigned} />}
      <input aria-label="Search complaints" name="search" defaultValue={q.search} placeholder="Search A421, B511, complaint, name…" />
      <select aria-label="Status" name="status" defaultValue={q.status || ""}>
        <option value="">All statuses</option>{[...complaintStatuses, "deleted"].map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
      </select>
      <Suspense fallback={<>
        {q.block && <input type="hidden" name="block" value={q.block}/>}
        <select aria-label="Block" disabled><option>Loading blocks…</option></select>
      </>}>
        <BlockSelect blocks={blocks} selected={q.block}/>
      </Suspense>
      <select aria-label="Priority" name="priority" defaultValue={q.priority || ""}>
        <option value="">All priorities</option>{priorities.map((priority) => <option key={priority} value={priority}>{titleCase(priority)}</option>)}
      </select>
      <select aria-label="Source" name="source" defaultValue={q.source || ""} disabled={isDeleted}>
        <option value="">All sources</option>{sources.map((source) => <option key={source} value={source}>{titleCase(source)}</option>)}
      </select>
      <input aria-label="Submitted date" type="date" name="date" defaultValue={q.date} />
      <button className="button">Filter</button>
    </form>;
}

async function ComplaintResults({ supabase, filters, blocks, canDelete }: FilterContext & { supabase: Database; canDelete: boolean }) {
  const q = await filters;
  const pageNumber = Number(q.page);
  const page = Number.isSafeInteger(pageNumber * PAGE_SIZE) && Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const roomSearch = parseRoomSearch(q.search);
  const isDeleted = q.status === "deleted";
  const selectedStatuses = selectedComplaintStatuses(q);
  const statusesShownInMenu = selectedStatuses.length ? selectedStatuses : [...complaintStatuses];
  const sort = selectedComplaintSort(q);
  let activeQuery = supabase.from("complaints").select("id,complaint_no,source,room_no,category,description,priority,status,submitted_at,block:blocks!block_id(code),assignee:profiles!assigned_to(full_name)");
  let deletedQuery = supabase.from("deleted_complaints").select("id,complaint_no,block_id,room_no,category,description,priority,submitted_at,deleted_at,deleted_by_name").order("deleted_at", { ascending: false }).order("id");

  if (isDeleted) {
    if (q.block) deletedQuery = deletedQuery.eq("block_id", q.block);
    if (q.priority) deletedQuery = deletedQuery.eq("priority", q.priority);
    if (q.date) deletedQuery = deletedQuery.gte("submitted_at", `${q.date}T00:00:00`).lt("submitted_at", `${q.date}T23:59:59.999`);
    if (roomSearch) deletedQuery = deletedQuery.or(roomSearchFilter(roomSearch));
    else if (q.search) deletedQuery = deletedQuery.or(`complaint_no.ilike.%${q.search}%,room_no.ilike.%${q.search}%,description.ilike.%${q.search}%`);
  } else {
    if (selectedStatuses.length) activeQuery = activeQuery.in("status", selectedStatuses);
    if (q.needAppointment) activeQuery = activeQuery.eq("need_appointment", true);
    if (q.block === "external") activeQuery = activeQuery.is("block_id", null);
    else if (q.block) activeQuery = activeQuery.eq("block_id", q.block);
    if (q.category) activeQuery = activeQuery.eq("category", q.category);
    if (q.priority) activeQuery = activeQuery.eq("priority", q.priority);
    if (q.source) activeQuery = activeQuery.eq("source", q.source);
    if (q.assigned === "unassigned") activeQuery = activeQuery.is("assigned_to", null);
    else if (q.assigned) activeQuery = activeQuery.eq("assigned_to", q.assigned);
    if (q.date) activeQuery = activeQuery.gte("submitted_at", `${q.date}T00:00:00`).lt("submitted_at", `${q.date}T23:59:59.999`);
    if (roomSearch) activeQuery = activeQuery.or(roomSearchFilter(roomSearch));
    else if (q.search) activeQuery = activeQuery.or(`complaint_no.ilike.%${q.search}%,room_no.ilike.%${q.search}%,description.ilike.%${q.search}%,complainant_name.ilike.%${q.search}%`);
    activeQuery = activeQuery.order(sort.sortBy, { ascending: sort.ascending }).order("id");
  }

  const { data, error } = await (isDeleted ? deletedQuery : activeQuery).range(offset, offset + PAGE_SIZE);
  const deletedBlocks = isDeleted ? (await blocks).data : null;
  const hasNext = (data?.length ?? 0) > PAGE_SIZE;
  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(q)) {
      if (value && key !== "page" && key !== "deleted") params.set(key, value);
    }
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    return query ? `/admin/complaints?${query}` : "/admin/complaints";
  };
  const sharedFilters: PreservedValue[] = [{ name: "search", value: q.search }, { name: "block", value: q.block }, { name: "category", value: q.category }, { name: "priority", value: q.priority }, { name: "source", value: q.source }, { name: "date", value: q.date }, { name: "assigned", value: q.assigned }, ...selectedStatuses.map((status) => ({ name: `status_${status}`, value: status }))];
  const preservedExcept = (name: string) => sharedFilters.filter((item) => item.name !== name);
  const statusFilter = <StatusColumnFilter
    action="/admin/complaints"
    statusOptions={complaintStatuses.map((status) => ({ value: status, label: titleCase(status) }))}
    selectedStatuses={statusesShownInMenu}
    sortOptions={complaintSortOptions.map(([value, label]) => ({ value, label }))}
    selectedSort={sort.value}
    preserved={[
      { name: "search", value: q.search },
      { name: "block", value: q.block },
      { name: "priority", value: q.priority },
      { name: "source", value: q.source },
      { name: "date", value: q.date },
      { name: "category", value: q.category },
      { name: "assigned", value: q.assigned },
    ]}
  />;
  async function LocationFilter() {
    const { data: choices } = await blocks;
    return <ColumnFilter label="Location" action="/admin/complaints" name="block" selectedValue={q.block} options={[...(choices || []).map((block) => ({ value: String(block.id), label: `Block ${block.code}` })), { value: "external", label: "External Area" }]} preserved={preservedExcept("block")} />;
  }

  async function CategoryFilter() {
    const { data } = await supabase.from("complaints").select("category").order("category");
    const categories = [...new Set((data || []).map(row => row.category).filter(Boolean))];
    return <ColumnFilter label="Category / description" action="/admin/complaints" name="category" selectedValue={q.category} options={categories.map(value => ({ value, label: value }))} preserved={preservedExcept("category")} />;
  }

  async function AssigneeFilter() {
    const { data } = await supabase.from("profiles").select("id,full_name").eq("role", "maintenance_staff").eq("is_active", true).order("full_name");
    return <ColumnFilter label="Assigned" action="/admin/complaints" name="assigned" selectedValue={q.assigned} options={[{ value: "unassigned", label: "Unassigned" }, ...(data || []).map(member => ({ value: member.id, label: member.full_name }))]} preserved={preservedExcept("assigned")} />;
  }

  const columnFilters = {
    location: <Suspense fallback="Location"><LocationFilter /></Suspense>,
    category: <Suspense fallback="Category / description"><CategoryFilter /></Suspense>,
    source: <ColumnFilter label="Source" action="/admin/complaints" name="source" selectedValue={q.source} options={sources.map((source) => ({ value: source, label: titleCase(source) }))} preserved={preservedExcept("source")} />,
    priority: <ColumnFilter label="Priority" action="/admin/complaints" name="priority" selectedValue={q.priority} options={priorities.map((priority) => ({ value: priority, label: titleCase(priority) }))} preserved={preservedExcept("priority")} />,
    submitted: <DateColumnFilter action="/admin/complaints" selectedDate={q.date} selectedSort={sort.value} preserved={preservedExcept("date")} />,
    assigned: <Suspense fallback="Assigned"><AssigneeFilter /></Suspense>,
  };

  return <>
    <section className="panel list-panel complaints-list-panel">
      {error ? <p className="error">{error.message}</p> : isDeleted
        ? <DeletedComplaintList rows={(data || []).slice(0, PAGE_SIZE) as DeletedComplaint[]} blocks={deletedBlocks || []} />
        : <ComplaintList rows={(data || []).slice(0, PAGE_SIZE) as unknown as ComplaintRow[]} canDelete={canDelete} statusFilter={statusFilter} columnFilters={columnFilters} />}
    </section>
    {!error && (page > 1 || hasNext) && <nav className="pagination" aria-label="Complaint pages">
      {page > 1 && <Link className="button secondary" href={pageHref(page - 1)}>Previous</Link>}
      <span>Page {page}</span>
      {hasNext && <Link className="button secondary" href={pageHref(page + 1)}>Next</Link>}
    </nav>}
  </>;
}
