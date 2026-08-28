import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const profile = await requireRole(["admin", "management_viewer"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_dashboard_counts");
  const counts = data?.[0];

  if (error) console.error("admin_dashboard_counts failed", error.message);

  return <AppShell profile={profile} title="Admin Dashboard"><Dashboard kind="admin" name={profile.full_name} values={[Number(counts?.new_complaints ?? 0), Number(counts?.today_tasks ?? 0), Number(counts?.completed_today ?? 0), Number(counts?.outstanding ?? 0)]} hrefs={["/admin/complaints?status=new", "/admin/jobs?scope=today-active", "/admin/jobs?scope=completed-today", "/admin/jobs?scope=outstanding"]}/></AppShell>;
}
