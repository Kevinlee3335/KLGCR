import { expect, it, vi } from "vitest";
import { loadAdminDashboardWorkload } from "./admin-dashboard-workload";

type Client = Parameters<typeof loadAdminDashboardWorkload>[0];

it("uses the aggregated row without fetching jobs or inventory records", async () => {
  const from = vi.fn();
  const rpc = vi.fn().mockResolvedValue({ data: [{
    assigned: 4, in_progress: 3, pending_material: 2, under_monitoring: 1, completed: 1234,
    out_of_stock: 12, near_reorder: 3,
  }], error: null });

  expect(await loadAdminDashboardWorkload({ rpc, from } as unknown as Client)).toEqual({
    jobs: { assigned: 4, in_progress: 3, pending_material: 2, under_monitoring: 1, completed: 1234 },
    inventory: { outOfStock: 12, nearReorder: 3 },
  });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("admin_dashboard_workload_counts");
  expect(from).not.toHaveBeenCalled();
});

it("keeps counts complete against a database without the new RPC", async () => {
  const jobs = Array.from({ length: 1201 }, () => ({ status: "completed" }));
  const stock = Array.from({ length: 501 }, () => ({ balance_qty: 1, reorder_level: 1 }));
  const ranges: Record<string, number[][]> = { maintenance_jobs: [], inventory_items: [] };
  const from = vi.fn((table: string) => ({
    select() { return this; },
    in() { return this; },
    eq() { return this; },
    order() { return this; },
    async range(start: number, end: number) {
      ranges[table].push([start, end]);
      return { data: (table === "maintenance_jobs" ? jobs : stock).slice(start, end + 1), error: null };
    },
  }));
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202" } });

  const workload = await loadAdminDashboardWorkload({ rpc, from } as unknown as Client);
  expect(workload.jobs.completed).toBe(1201);
  expect(workload.inventory).toEqual({ outOfStock: 0, nearReorder: 501 });
  expect(ranges.maintenance_jobs).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  expect(ranges.inventory_items).toEqual([[0, 499], [500, 999]]);
});
