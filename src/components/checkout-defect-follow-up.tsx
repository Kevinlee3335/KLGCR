import { createClient } from "@/lib/supabase/server";
import { malaysiaDate } from "@/lib/monitoring-follow-up";
import { checkoutDateLabel } from "@/lib/job-checkout";
import { DashboardActionFollowUp } from "./dashboard-action-follow-up";

export async function CheckoutDefectFollowUp({ staffId }: { staffId?: string }) {
  const db = await createClient();
  let query = db.from("maintenance_jobs")
    .select("id,job_no,room_no,checkout_date,checkout_note,block:blocks!block_id(code)", { count: "exact" })
    .eq("status", "waiting_checkout").lte("checkout_date", malaysiaDate())
    .order("checkout_date").order("id").limit(10);
  if (staffId) query = query.eq("assigned_to", staffId);
  const { data, error, count } = await query;
  if (error) return <p className="error" role="alert">Unable to load defects waiting for check-out. Please refresh.</p>;
  const base = staffId ? "/staff" : "/admin";
  const rows = (data || []) as unknown as { id: string; job_no: string; room_no: string; checkout_date: string; checkout_note: string | null; block: { code: string } | null }[];
  return <DashboardActionFollowUp title="Repairs after Check-out" subtitle="Check-out dates reached. Confirm the room is vacant before starting repairs."
    count={count || 0} href={`${base}/${staffId ? "tasks" : "jobs"}?status=waiting_checkout`} action="Open job"
    items={rows.map(row => ({ id: row.id, name: `Block ${row.block?.code || "External Area"} · ${row.room_no}`, detail: row.checkout_note || row.job_no, meta: `Check-out: ${checkoutDateLabel(row.checkout_date)}`, href: `${base}/jobs/${row.id}` }))}/>;
}
