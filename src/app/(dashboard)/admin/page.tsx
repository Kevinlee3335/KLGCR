import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Dashboard, type AdminDashboardData } from "@/components/dashboard";
import { createClient } from "@/lib/supabase/server";

function malaysiaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function AdminPage() {
  const profile = await requireRole(["admin", "management_viewer"]);
  const supabase = await createClient();
  const today = malaysiaToday();
  const [{ data: countRows, error: countError }, { data: statusRows }, { data: complaints }, { data: tasks }, { data: inventory }] = await Promise.all([
    supabase.rpc("admin_dashboard_counts"),
    supabase.from("maintenance_jobs").select("status").in("status", ["assigned", "in_progress", "pending_material", "under_monitoring", "completed"]),
    supabase.from("complaints").select("id,complaint_no,room_no,category,description,priority,status,submitted_at,block:blocks!block_id(code)").order("submitted_at", { ascending: false }).limit(5),
    supabase.from("maintenance_jobs").select("id,job_no,room_no,description,status,scheduled_for,assigned_at,block:blocks!block_id(code),assignee:profiles!assigned_to(full_name)").eq("scheduled_for", today).not("status", "in", '("completed","cancelled")').order("assigned_at", { ascending: true }).limit(5),
    supabase.from("inventory_items").select("balance_qty,reorder_level").eq("is_active", true),
  ]);
  if (countError) console.error("admin_dashboard_counts failed", countError.message);
  const counts = countRows?.[0];
  const jobs = { assigned: 0, in_progress: 0, pending_material: 0, under_monitoring: 0, completed: 0 };
  for (const row of statusRows ?? []) if (row.status in jobs) jobs[row.status as keyof typeof jobs]++;
  const stock = (inventory ?? []).reduce((summary, item) => { const balance = Number(item.balance_qty); const reorder = Number(item.reorder_level); if (balance <= 0) summary.outOfStock++; else if (balance <= reorder) summary.nearReorder++; return summary; }, { outOfStock: 0, nearReorder: 0 });
  const data: AdminDashboardData = {
    kpis: { newComplaints: Number(counts?.new_complaints ?? 0), todayJobs: Number(counts?.today_tasks ?? 0), inProgress: jobs.in_progress, pendingMaterial: jobs.pending_material, underMonitoring: jobs.under_monitoring, completedToday: Number(counts?.completed_today ?? 0) },
    jobs, complaints: (complaints ?? []) as unknown as AdminDashboardData["complaints"], tasks: (tasks ?? []) as unknown as AdminDashboardData["tasks"], inventory: stock,
  };
  return <AppShell profile={profile} title="Dashboard"><Dashboard kind="admin" name={profile.full_name} data={data}/></AppShell>;
}
