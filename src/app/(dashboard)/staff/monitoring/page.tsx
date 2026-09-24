import { AppShell } from "@/components/app-shell";
import { JobList } from "@/components/phase2-ui";
import { requireRole } from "@/lib/auth";
import type { JobRow } from "@/lib/phase2";
import { createClient } from "@/lib/supabase/server";

export default async function MonitoringPage() {
  const profile = await requireRole(["maintenance_staff"]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("maintenance_jobs").select("id,job_no,room_no,category,description,priority,status,assigned_at,updated_at,block:blocks!block_id(id,code)").eq("status", "under_monitoring").order("monitoring_review_at", { ascending: true, nullsFirst: false });
  return <AppShell profile={profile} title="Monitoring"><div className="section-head"><div><h2>Jobs under monitoring</h2><p className="subtle">Review observations and complete resolved work.</p></div></div><section className="panel list-panel">{error ? <p className="error">{error.message}</p> : <JobList rows={(data || []) as unknown as JobRow[]} staff compact returnTo="/staff/monitoring"/>}</section></AppShell>;
}
