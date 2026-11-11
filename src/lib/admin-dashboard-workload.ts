import type { AdminDashboardData } from "@/components/dashboard";
import type { createClient } from "@/lib/supabase/server";

type DashboardClient = Awaited<ReturnType<typeof createClient>>;
type Workload = Pick<AdminDashboardData, "jobs" | "inventory">;
const jobStatuses = ["assigned", "in_progress", "pending_material", "under_monitoring", "completed"] as const;
const fallbackPageSize = 500;

async function readFallbackRows<Row>(
  label: string,
  query: (start: number, end: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
) {
  const rows: Row[] = [];
  for (let start = 0; ; start += fallbackPageSize) {
    const { data, error } = await query(start, start + fallbackPageSize - 1);
    if (error) {
      console.error(`Dashboard ${label} could not be loaded`, error.message);
      return [];
    }
    if (!data?.length) return rows;
    rows.push(...data);
    if (data.length < fallbackPageSize) return rows;
  }
}

export async function loadAdminDashboardWorkload(supabase: DashboardClient): Promise<Workload> {
  const jobs: Workload["jobs"] = { assigned: 0, in_progress: 0, pending_material: 0, under_monitoring: 0, completed: 0 };
  const inventory = { outOfStock: 0, nearReorder: 0 };
  const { data, error } = await supabase.rpc("admin_dashboard_workload_counts");
  if (!error) {
    const row = data?.[0];
    if (row) {
      for (const status of jobStatuses) jobs[status] = Number(row[status]);
      inventory.outOfStock = Number(row.out_of_stock);
      inventory.nearReorder = Number(row.near_reorder);
    }
    return { jobs, inventory };
  }

  // An app preview or rolling deployment can still be connected to the previous schema.
  if (!["PGRST202", "42883"].includes(error.code)) {
    console.error("admin_dashboard_workload_counts failed", error.message);
  }
  const [jobRows, stockRows] = await Promise.all([
    readFallbackRows("jobs", (start, end) => supabase.from("maintenance_jobs").select("status").in("status", jobStatuses).order("id").range(start, end)),
    readFallbackRows("inventory", (start, end) => supabase.from("inventory_items").select("balance_qty,reorder_level").eq("is_active", true).order("id").range(start, end)),
  ]);
  for (const { status } of jobRows) {
    if (status in jobs) jobs[status as keyof typeof jobs]++;
  }
  for (const { balance_qty, reorder_level } of stockRows) {
    const balance = Number(balance_qty);
    if (balance <= 0) inventory.outOfStock++;
    else if (balance <= Number(reorder_level)) inventory.nearReorder++;
  }
  return { jobs, inventory };
}
