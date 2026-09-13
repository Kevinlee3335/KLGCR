import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Dashboard, type AdminDashboardData } from "@/components/dashboard";
import { createClient } from "@/lib/supabase/server";
import { unresolvedTenantNoShows, type TenantNoShowNotification } from "@/lib/admin-notifications";

function malaysiaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function AdminPage() {
  const profile = await requireRole(["admin", "management_viewer"]);
  const supabase = await createClient();
  const today = malaysiaToday();
  const [{ data: countRows, error: countError }, { data: statusRows }, { data: complaints }, { data: tasks }, { data: inventory },{count:todayAppointments},{count:pendingAppointments},{data:noShowRows,error:noShowError}] = await Promise.all([
    supabase.rpc("admin_dashboard_counts"),
    supabase.from("maintenance_jobs").select("status").in("status", ["assigned", "in_progress", "pending_material", "under_monitoring", "completed"]),
    supabase.from("complaints").select("id,complaint_no,room_no,category,description,priority,status,submitted_at,availability_date,availability_time,room_access_permission,block:blocks!block_id(code)").order("submitted_at", { ascending: false }).limit(5),
    supabase.from("maintenance_jobs").select("id,job_no,room_no,description,status,scheduled_for,assigned_at,complaint:complaints!inner(availability_date,availability_time,room_access_permission),block:blocks!block_id(code),assignee:profiles!assigned_to(full_name)").eq("scheduled_for", today).neq("complaints.room_access_permission","no").not("status", "in", '("completed","cancelled")').order("assigned_at", { ascending: true }).limit(5),
    supabase.from("inventory_items").select("balance_qty,reorder_level").eq("is_active", true),
    supabase.from("appointments").select("*",{count:"exact",head:true}).eq("appointment_date",today).not("status","in",'("cancelled","no_show")'),
    supabase.from("appointments").select("*",{count:"exact",head:true}).eq("status","pending_confirmation"),
    supabase.from("appointments")
      .select("id,job_id,appointment_date,appointment_time,attended_at,no_show_remarks,attendee:profiles!appointments_attended_by_fkey(full_name),job:maintenance_jobs!appointments_job_id_fkey(id,job_no,status,room_no,block:blocks!block_id(code))")
      .eq("status","no_show")
      .order("attended_at",{ascending:false}),
  ]);
  if (countError) console.error("admin_dashboard_counts failed", countError.message);
  if (noShowError) console.error("Dashboard tenant no-shows could not be loaded", noShowError.message);
  const noShows=(noShowRows??[]) as unknown as TenantNoShowNotification[];
  const openNoShowJobIds=[...new Set(noShows.filter((row)=>row.job&&!["completed","cancelled"].includes(row.job.status)).map((row)=>row.job_id))];
  const {data:activeAppointmentRows}=openNoShowJobIds.length
    ? await supabase.from("appointments").select("job_id").in("job_id",openNoShowJobIds).in("status",["pending_confirmation","confirmed"])
    : {data:[] as {job_id:string}[]};
  const tenantNoShows=unresolvedTenantNoShows(noShows,(activeAppointmentRows??[]).map((row)=>row.job_id));
  const counts = countRows?.[0];
  const jobs = { assigned: 0, in_progress: 0, pending_material: 0, under_monitoring: 0, completed: 0 };
  for (const row of statusRows ?? []) if (row.status in jobs) jobs[row.status as keyof typeof jobs]++;
  const stock = (inventory ?? []).reduce((summary, item) => { const balance = Number(item.balance_qty); const reorder = Number(item.reorder_level); if (balance <= 0) summary.outOfStock++; else if (balance <= reorder) summary.nearReorder++; return summary; }, { outOfStock: 0, nearReorder: 0 });
  const data: AdminDashboardData = {
    kpis: { tenantNotAvailable: tenantNoShows.length, newComplaints: Number(counts?.new_complaints ?? 0), todayJobs: Number(counts?.today_tasks ?? 0), inProgress: jobs.in_progress, pendingMaterial: jobs.pending_material, underMonitoring: jobs.under_monitoring, completedToday: Number(counts?.completed_today ?? 0),todayAppointments:todayAppointments||0,pendingAppointments:pendingAppointments||0 },
    tenantNoShows, jobs, complaints: (complaints ?? []) as unknown as AdminDashboardData["complaints"], tasks: (tasks ?? []) as unknown as AdminDashboardData["tasks"], inventory: stock,
  };
  return <AppShell profile={profile} title="Dashboard"><Dashboard kind="admin" name={profile.full_name} data={data}/></AppShell>;
}
