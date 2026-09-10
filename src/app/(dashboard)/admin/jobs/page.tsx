import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { JobList } from "@/components/phase2-ui";
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
  let query = supabase.from("maintenance_jobs").select("id,job_no,room_no,category,description,priority,status,assigned_at,updated_at,started_at,completed_at,scheduled_for,block:blocks!block_id(id,code),assignee:profiles!assigned_to(id,full_name),complaint:complaints!complaint_id(complaint_no,availability_date,availability_time,room_access_permission),appointments(appointment_date,appointment_time,status)").order("updated_at", { ascending: false });
  if (filters.scope === "today-active") query = query.eq("scheduled_for", today).in("status", ["assigned", "in_progress", "pending_material", "under_monitoring"]);
  if (filters.scope === "completed-today") query = query.eq("status", "completed").gte("completed_at", `${today}T00:00:00+08:00`).lt("completed_at", `${today}T23:59:59.999+08:00`);
  if (filters.scope === "outstanding") query = query.in("status", ["assigned", "in_progress", "pending_material", "under_monitoring"]);
  if (filters.block) query = query.eq("block_id", filters.block);
  if (filters.staff) query = query.eq("assigned_to", filters.staff);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.date) query = query.eq("scheduled_for", filters.date);
  if (filters.search) query = query.or(`job_no.ilike.%${filters.search}%,room_no.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const [{ data: jobRows, error }, { data: blocks }, { data: staff }] = await Promise.all([
    query,
    supabase.from("blocks").select("id,code").order("code"),
    supabase.from("profiles").select("id,full_name").eq("role", "maintenance_staff").eq("is_active", true).order("full_name"),
  ]);
  const data = (jobRows || []).slice(0, PAGE_SIZE);
  const pageHref = (target: number) => { const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value && key !== "page") params.set(key, value); }); params.set("page", String(target)); return `/admin/jobs?${params}`; };
  const hasNext = (jobRows?.length || 0) > PAGE_SIZE;

  return <AppShell profile={profile} title="Maintenance Jobs"><div className="section-head"><div><h2>Maintenance jobs</h2><p className="subtle">All approved and assigned operational work.</p></div></div><form className="panel filter-bar"><input name="search" defaultValue={filters.search} placeholder="Search job, room, description…"/><select name="block" defaultValue={filters.block || ""}><option value="">All blocks</option>{blocks?.map((block) => <option key={block.id} value={block.id}>Block {block.code}</option>)}</select><select name="staff" defaultValue={filters.staff || ""}><option value="">All staff</option>{staff?.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select><select name="status" defaultValue={filters.status || ""}><option value="">All statuses</option>{jobStatuses.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select><select name="priority" defaultValue={filters.priority || ""}><option value="">All priorities</option>{priorities.map((priority) => <option key={priority} value={priority}>{titleCase(priority)}</option>)}</select><input type="date" name="date" defaultValue={filters.date}/><button className="button">Filter</button></form><section className="panel list-panel">{error ? <p className="error">{error.message}</p> : <JobList rows={(data || []) as unknown as JobRow[]}/>}</section>{(page > 1 || hasNext) && <nav className="pagination" aria-label="Job pages">{page > 1 && <Link className="button secondary button-link" href={pageHref(page - 1)}>Previous</Link>}<span>Page {page}</span>{hasNext && <Link className="button secondary button-link" href={pageHref(page + 1)}>Next</Link>}</nav>}</AppShell>;
}
