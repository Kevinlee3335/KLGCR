import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { JobList } from "@/components/phase2-ui";
import { createClient } from "@/lib/supabase/server";
import type { JobRow } from "@/lib/phase2";

export default async function StaffPage() {
  const profile = await requireRole(["maintenance_staff"]);
  const supabase = await createClient();
  const [statusResult, recentResult] = await Promise.all([
    supabase.from("maintenance_jobs").select("status"),
    supabase.from("maintenance_jobs").select("id,job_no,room_no,category,description,priority,status,assigned_at,updated_at,block:blocks!block_id(id,code)").order("assigned_at", { ascending: false }).limit(5),
  ]);
  const statuses = statusResult.data || [];
  const rows = (recentResult.data || []) as unknown as JobRow[];
  const blocks = profile.blocks?.map((block) => `Block ${block.code}`).join(" & ");
  const count = (status: string) => statuses.filter((row) => row.status === status).length;
  return <AppShell profile={profile} title="My Dashboard"><Dashboard kind="staff" name={profile.full_name} blocks={blocks} values={[count("assigned"), count("in_progress"), count("pending_material"), count("completed")]}/><div className="section-head tasks-head"><h2>Recent jobs</h2><Link className="text-link" href="/staff/tasks">View current tasks</Link></div><section className="panel list-panel">{recentResult.error ? <p className="error">{recentResult.error.message}</p> : <JobList rows={rows} staff compact/>}</section></AppShell>;
}
