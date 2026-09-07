import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminJobList } from "@/components/phase2-ui";
import { requireRole } from "@/lib/auth";
import { jobStatuses, priorities, titleCase, type JobRow } from "@/lib/phase2";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

function malaysiaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const filters = await searchParams;
  const supabase = await createClient();
  const page = Math.max(1, Number(filters.page) || 1);
  const today = malaysiaToday();
  const todayStart = `${today}T00:00:00+08:00`;
  const todayEnd = `${today}T23:59:59.999+08:00`;
  let query = supabase.from("maintenance_jobs").select("id,job_no,room_no,category,description,priority,status,assigned_at,updated_at,started_at,completed_at,scheduled_for,block:blocks!block_id(id,code),assignee:profiles!assigned_to(id,full_name),complaint:complaints!complaint_id(id,complaint_no)").order("updated_at", { ascending: false });
  if (filters.scope === "today-active") query = query.eq("scheduled_for", today).in("status", ["assigned", "accepted", "in_progress", "paused", "pending_material", "under_monitoring", "reopened"]);
  if (filters.scope === "completed-today") query = query.in("status", ["completed", "verified", "closed"]).gte("completed_at", todayStart).lte("completed_at", todayEnd);
  if (filters.scope === "outstanding") query = query.in("status", ["assigned", "accepted", "in_progress", "paused", "pending_material", "under_monitoring", "reopened"]);
  if (filters.block) query = query.eq("block_id", filters.block);
  if (filters.staff) query = query.eq("assigned_to", filters.staff);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.date) query = query.eq("scheduled_for", filters.date);
  if (filters.search) query = query.or(`job_no.ilike.%${filters.search}%,room_no.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const [{ data: jobRows, error }, { data: blocks }, { data: staff }, { data: categoryRows }, { count: totalJobs }, { count: openJobs }, { count: inProgress }, { count: pendingMaterial }, { count: completedToday }, { count: overdue }] = await Promise.all([
    query,
    supabase.from("blocks").select("id,code").order("code"),
    supabase.from("profiles").select("id,full_name").eq("role", "maintenance_staff").eq("is_active", true).order("full_name"),
    supabase.from("maintenance_jobs").select("category").order("category"),
    supabase.from("maintenance_jobs").select("*", { count: "exact", head: true }),
    supabase.from("maintenance_jobs").select("*", { count: "exact", head: true }).in("status", ["assigned", "accepted", "in_progress", "paused", "pending_material", "under_monitoring", "reopened"]),
    supabase.from("maintenance_jobs").select("*", { count: "exact", head: true }).in("status", ["in_progress", "paused"]),
    supabase.from("maintenance_jobs").select("*", { count: "exact", head: true }).eq("status", "pending_material"),
    supabase.from("maintenance_jobs").select("*", { count: "exact", head: true }).in("status", ["completed", "verified", "closed"]).gte("completed_at", todayStart).lte("completed_at", todayEnd),
    supabase.from("maintenance_jobs").select("*", { count: "exact", head: true }).lt("scheduled_for", today).in("status", ["assigned", "accepted", "in_progress", "paused", "pending_material", "under_monitoring", "reopened"]),
  ]);
  const data = (jobRows ?? []).slice(0, PAGE_SIZE);
  const categories = [...new Set((categoryRows ?? []).map((row) => row.category))];
  const pageHref = (target: number) => { const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value && key !== "page") params.set(key, value); }); params.set("page", String(target)); return `/admin/jobs?${params}`; };
  const hasNext = (jobRows?.length ?? 0) > PAGE_SIZE;

  return <AppShell profile={profile} title="Maintenance Jobs">
    <div className="jobs-heading"><div><p className="eyebrow">Work Order Control</p><h2>Maintenance Jobs</h2><p className="subtle">Track responsibility, progress and the next required action.</p></div>{profile.role === "admin" && <Link className="button button-link" href="/admin/complaints/new"><Plus size={17}/> New Job</Link>}</div>
    <section className="job-summary" aria-label="Job summary">{[["Total Jobs",totalJobs],["Open",openJobs],["In Progress",inProgress],["Pending Material",pendingMaterial],["Completed Today",completedToday],["Overdue",overdue]].map(([label,value])=><article className="job-summary-card" key={String(label)}><span>{label}</span><strong>{value??0}</strong></article>)}</section>
    <form className="job-filters"><label className="job-search"><Search size={18}/><span className="sr-only">Search jobs</span><input name="search" defaultValue={filters.search} placeholder="Job number, room or description"/></label><label><span>Block</span><select name="block" defaultValue={filters.block||""}><option value="">All blocks</option>{blocks?.map((block)=><option key={block.id} value={block.id}>Block {block.code}</option>)}</select></label><label><span>Staff</span><select name="staff" defaultValue={filters.staff||""}><option value="">All staff</option>{staff?.map((member)=><option key={member.id} value={member.id}>{member.full_name}</option>)}</select></label><label><span>Status</span><select name="status" defaultValue={filters.status||""}><option value="">All statuses</option>{jobStatuses.map((status)=><option key={status} value={status}>{titleCase(status)}</option>)}</select></label><label><span>Priority</span><select name="priority" defaultValue={filters.priority||""}><option value="">All priorities</option>{priorities.map((priority)=><option key={priority} value={priority}>{titleCase(priority)}</option>)}</select></label><label><span>Category</span><select name="category" defaultValue={filters.category||""}><option value="">All categories</option>{categories.map((category)=><option key={category} value={category}>{category}</option>)}</select></label><label><span>Date</span><input type="date" name="date" defaultValue={filters.date}/></label><button className="button" type="submit">Apply</button></form>
    <section className="job-list-panel">{error?<p className="error">{error.message}</p>:<AdminJobList rows={data as unknown as JobRow[]}/>}</section>
    {(page>1||hasNext)&&<nav className="pagination" aria-label="Job pages">{page>1&&<Link className="button secondary button-link" href={pageHref(page-1)}>Previous</Link>}<span>Page {page}</span>{hasNext&&<Link className="button secondary button-link" href={pageHref(page+1)}>Next</Link>}</nav>}
  </AppShell>;
}
