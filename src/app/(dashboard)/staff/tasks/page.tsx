import { AppShell } from "@/components/app-shell";
import { JobList } from "@/components/phase2-ui";
import { requireRole } from "@/lib/auth";
import { jobStatuses, titleCase, type JobRow } from "@/lib/phase2";
import { createClient } from "@/lib/supabase/server";

export default async function Tasks({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const profile = await requireRole(["maintenance_staff"]);
  const filters = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("maintenance_jobs").select("id,job_no,room_no,category,description,priority,status,assigned_at,updated_at,block:blocks!block_id(id,code)").order("assigned_at", { ascending: false });
  query = filters.status ? query.eq("status", filters.status) : query.in("status", ["assigned", "accepted", "in_progress", "paused", "reopened"]);
  const { data, error } = await query;
  return <AppShell profile={profile} title="My Tasks"><div className="section-head"><div><h2>{filters.status ? titleCase(filters.status) : "Current tasks"}</h2><p className="subtle">Assigned and in-progress jobs in your allowed blocks.</p></div></div><form className="panel filter-bar"><select name="status" defaultValue={filters.status || ""}><option value="">Current tasks</option>{jobStatuses.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select><button className="button">Filter</button></form><section className="panel list-panel">{error ? <p className="error">{error.message}</p> : <JobList rows={(data || []) as unknown as JobRow[]} staff compact/>}</section></AppShell>;
}
