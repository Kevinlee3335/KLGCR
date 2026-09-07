import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ComplaintList } from "@/components/phase2-ui";
import { requireRole } from "@/lib/auth";
import { priorities, complaintStatuses, type ComplaintRow } from "@/lib/phase2";
import { createClient } from "@/lib/supabase/server";

const priorityLabel: Record<string, string> = { low: "Low", normal: "Medium", high: "High", urgent: "Emergency" };
const statusLabel: Record<string, string> = { new: "New", under_review: "Reviewed", assigned: "Assigned", rejected: "Rejected", closed: "Closed" };

function malaysiaDayRange() {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return [`${date}T00:00:00+08:00`, `${date}T23:59:59.999+08:00`];
}

export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const filters = await searchParams;
  const supabase = await createClient();
  const [todayStart, todayEnd] = malaysiaDayRange();
  let query = supabase.from("complaints").select("id,complaint_no,source,room_no,complainant_name,complainant_contact,category,description,priority,status,submitted_at,assigned_at,block:blocks!block_id(id,code),assignee:profiles!assigned_to(id,full_name)");
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.block) query = query.eq("block_id", filters.block);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.date) query = query.gte("submitted_at", `${filters.date}T00:00:00+08:00`).lte("submitted_at", `${filters.date}T23:59:59.999+08:00`);
  if (filters.search) query = query.or(`complaint_no.ilike.%${filters.search}%,room_no.ilike.%${filters.search}%,complainant_name.ilike.%${filters.search}%`);
  if (filters.sort === "oldest") query = query.order("submitted_at", { ascending: true });
  else if (filters.sort === "priority") query = query.order("priority", { ascending: false }).order("submitted_at", { ascending: false });
  else query = query.order("submitted_at", { ascending: false });

  const [{ data, error }, { data: blocks }, { data: categoryRows }, { count: newCount }, { count: openCount }, { count: assignedToday }, { count: highCount }] = await Promise.all([
    query,
    supabase.from("blocks").select("id,code").order("code"),
    supabase.from("complaints").select("category").order("category"),
    supabase.from("complaints").select("*", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("complaints").select("*", { count: "exact", head: true }).in("status", ["new", "under_review"]),
    supabase.from("complaints").select("*", { count: "exact", head: true }).eq("status", "assigned").gte("assigned_at", todayStart).lte("assigned_at", todayEnd),
    supabase.from("complaints").select("*", { count: "exact", head: true }).in("priority", ["high", "urgent"]).not("status", "in", "(rejected,closed)"),
  ]);
  const categories = [...new Set((categoryRows ?? []).map((row) => row.category))];

  return <AppShell profile={profile} title="Complaint Management">
    <div className="complaints-heading"><div><p className="eyebrow">Operations Intake</p><h2>Complaint Management</h2><p className="subtle">Review, prioritise and assign maintenance requests.</p></div>{profile.role === "admin" && <Link className="button button-link" href="/admin/complaints/new"><Plus size={17}/> Add Complaint</Link>}</div>
    <section className="complaint-summary" aria-label="Complaint summary">{[["New Complaints", newCount], ["Open Complaints", openCount], ["Assigned Today", assignedToday], ["High Priority", highCount]].map(([label, value]) => <article className="complaint-summary-card" key={String(label)}><span>{label}</span><strong>{value ?? 0}</strong></article>)}</section>
    <form className="complaint-filters"><label className="complaint-search"><Search size={18}/><span className="sr-only">Search complaints</span><input name="search" defaultValue={filters.search} placeholder="Complaint number, student or room"/></label><label><span>Block</span><select name="block" defaultValue={filters.block ?? ""}><option value="">All blocks</option>{blocks?.map((block) => <option key={block.id} value={block.id}>Block {block.code}</option>)}</select></label><label><span>Category</span><select name="category" defaultValue={filters.category ?? ""}><option value="">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label><span>Priority</span><select name="priority" defaultValue={filters.priority ?? ""}><option value="">All priorities</option>{priorities.map((priority) => <option key={priority} value={priority}>{priorityLabel[priority]}</option>)}</select></label><label><span>Status</span><select name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option>{complaintStatuses.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></label><label><span>Date</span><input type="date" name="date" defaultValue={filters.date}/></label><label><span>Sort</span><select name="sort" defaultValue={filters.sort ?? "newest"}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="priority">Priority</option></select></label><button className="button" type="submit">Apply</button></form>
    <section className="complaint-list-panel">{error ? <p className="error">{error.message}</p> : <ComplaintList rows={(data ?? []) as unknown as ComplaintRow[]}/>}</section>
  </AppShell>;
}
