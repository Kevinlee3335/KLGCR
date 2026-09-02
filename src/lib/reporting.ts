/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReportKind = "morning_tasks" | "midday_update" | "daily_summary" | "progress_snapshot" | "inventory_report";
export type BlockGroup = "AB" | "CD" | "ALL";

type JobRow = {
  job_no: string;
  room_no: string;
  status: string;
  category: string;
  scheduled_for: string | null;
  completed_at: string | null;
  blocks: { code: string } | null;
  profiles: { full_name: string } | null;
};

function malaysiaDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function groupCodes(group: BlockGroup) {
  if (group === "AB") return ["A", "B"];
  if (group === "CD") return ["C", "D"];
  return ["A", "B", "C", "D"];
}

function titleFor(kind: ReportKind) {
  return {
    morning_tasks: "9:00 AM Morning Daily Task",
    midday_update: "12:00 PM Midday Update",
    daily_summary: "4:50 PM Daily Summary",
    progress_snapshot: "3-Hour Progress Snapshot",
    inventory_report: "Inventory Report",
  }[kind];
}

export async function buildReport(supabase: SupabaseClient, kind: ReportKind, group: BlockGroup) {
  const today = malaysiaDateString();
  const codes = groupCodes(group);
  const { data: blocks, error: blockError } = await supabase.from("blocks").select("id,code").in("code", codes);
  if (blockError) throw blockError;
  const blockIds = (blocks ?? []).map((row) => row.id);

  if (kind === "inventory_report") {
    const { data, error } = await supabase.from("inventory_items").select("item_code,description,category,movement_category,balance_qty,reorder_level,cost,unit").eq("is_active", true).order("movement_category").order("description");
    if (error) throw error;
    const items = data ?? [];
    const out = items.filter((i) => Number(i.balance_qty) === 0);
    const near = items.filter((i) => Number(i.balance_qty) > 0 && Number(i.balance_qty) <= Number(i.reorder_level));
    const text = [`KLGCR | ${titleFor(kind)}`, `Date: ${today}`, `Total Items: ${items.length}`, `Out of Stock: ${out.length}`, `Near Reorder: ${near.length}`, "", "Out of Stock:", ...out.slice(0, 20).map((i) => `- ${i.item_code} ${i.description}: ${i.balance_qty} ${i.unit ?? ""}`), "", "Near Reorder:", ...near.slice(0, 20).map((i) => `- ${i.item_code} ${i.description}: ${i.balance_qty} ${i.unit ?? ""}`)].join("\n");
    return { reportDate: today, payload: { total: items.length, out_of_stock: out, near_reorder: near, items }, whatsappText: text };
  }

  const { data, error } = await supabase.from("maintenance_jobs").select("job_no,room_no,status,category,scheduled_for,completed_at,blocks(code),profiles!maintenance_jobs_assigned_to_fkey(full_name)").in("block_id", blockIds).order("assigned_at", { ascending: true });
  if (error) throw error;
  const jobs = (data ?? []) as unknown as JobRow[];
  const active = jobs.filter((j) => !["completed", "cancelled"].includes(j.status));
  const scheduledToday = active.filter((j) => j.scheduled_for === today);
  const completedToday = jobs.filter((j) => j.completed_at && malaysiaDateString(new Date(j.completed_at)) === today);
  const pendingMaterial = active.filter((j) => j.status === "pending_material");
  const monitoring = active.filter((j) => j.status === "under_monitoring");
  const inProgress = active.filter((j) => j.status === "in_progress");
  const assigned = active.filter((j) => j.status === "assigned");

  const { data: issuedRows } = await supabase
    .from("inventory_issue_history")
    .select("id,qty,issued_at,inventory_items(item_code,description,unit),maintenance_jobs(job_no,room_no,blocks(code)),profiles!inventory_issue_history_staff_id_fkey(full_name)")
    .gte("issued_at", `${today}T00:00:00+08:00`)
    .lt("issued_at", `${today}T23:59:59.999+08:00`)
    .order("issued_at", { ascending: true });
  const materialsIssued = ((issuedRows ?? []) as any[]).filter((row) => codes.includes(row.maintenance_jobs?.blocks?.code));

  const lines = [`KLGCR | ${titleFor(kind)} | ${group}`, `Date: ${today}`, `Scheduled Today: ${scheduledToday.length}`, `Completed Today: ${completedToday.length}`, `In Progress: ${inProgress.length}`, `Pending Material: ${pendingMaterial.length}`, `Under Monitoring: ${monitoring.length}`, `Assigned: ${assigned.length}`];
  const list = kind === "morning_tasks" ? scheduledToday : kind === "daily_summary" ? completedToday : active;
  if (list.length) {
    lines.push("", kind === "morning_tasks" ? "Today's Tasks:" : kind === "daily_summary" ? "Completed Today:" : "Current Jobs:");
    list.slice(0, 30).forEach((j) => lines.push(`- ${j.job_no} | Block ${j.blocks?.code ?? "-"} ${j.room_no} | ${j.category} | ${j.status.replaceAll("_", " ")} | ${j.profiles?.full_name ?? "Unassigned"}`));
  }
  if (kind !== "morning_tasks" && materialsIssued.length) {
    lines.push("", "Material Issued Today:");
    materialsIssued.slice(0, 20).forEach((row:any) => lines.push(`- ${row.inventory_items?.item_code ?? "-"} ${row.inventory_items?.description ?? ""} | ${row.qty} ${row.inventory_items?.unit ?? ""} | ${row.maintenance_jobs?.job_no ?? "-"} | Block ${row.maintenance_jobs?.blocks?.code ?? "-"} ${row.maintenance_jobs?.room_no ?? ""} | ${row.profiles?.full_name ?? "-"}`));
  }
  if (kind === "daily_summary" && (pendingMaterial.length || monitoring.length || assigned.length || inProgress.length)) {
    lines.push("", "Carry Forward:");
    [...pendingMaterial, ...monitoring, ...inProgress, ...assigned].slice(0, 25).forEach((j) => lines.push(`- ${j.job_no} | Block ${j.blocks?.code ?? "-"} ${j.room_no} | ${j.status.replaceAll("_", " ")}`));
  }

  return {
    reportDate: today,
    payload: { scheduled_today: scheduledToday, completed_today: completedToday, active, materials_issued: materialsIssued, counts: { scheduled_today: scheduledToday.length, completed_today: completedToday.length, in_progress: inProgress.length, pending_material: pendingMaterial.length, under_monitoring: monitoring.length, assigned: assigned.length } },
    whatsappText: lines.join("\n"),
  };
}
