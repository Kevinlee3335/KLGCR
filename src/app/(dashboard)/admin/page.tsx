import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const profile = await requireRole(["admin", "management_viewer"]);
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ count: newComplaints }, { count: todayTasks }, { count: completedToday }, { count: outstanding }] = await Promise.all([
    supabase.from("complaints").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("maintenance_jobs").select("id", { count: "exact", head: true }).gte("assigned_at", today).not("status", "in", "(completed,cancelled)"),
    supabase.from("maintenance_jobs").select("id", { count: "exact", head: true }).eq("status", "completed").gte("completed_at", today),
    supabase.from("maintenance_jobs").select("id", { count: "exact", head: true }).in("status", ["assigned", "in_progress", "pending_material", "under_monitoring"]),
  ]);
  return <AppShell profile={profile} title="Admin Dashboard"><Dashboard kind="admin" name={profile.full_name} values={[newComplaints || 0, todayTasks || 0, completedToday || 0, outstanding || 0]} hrefs={["/admin/complaints?status=new", "/admin/jobs?scope=today-active", "/admin/jobs?scope=completed-today", "/admin/jobs?scope=outstanding"]}/></AppShell>;
}
