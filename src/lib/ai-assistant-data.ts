import { createClient } from "@/lib/supabase/server";
import { summarize, complaintDateSummary, materialUsageSummary } from "./ai-assistant";
// Only authenticated SELECT queries. Never invoke recurrence materialization or other operational RPCs.
export async function readAiSnapshot(question: string) {
  const db = await createClient();
  const specs = [
    { table: "complaints", columns: "complaint_no,room_no,category,priority,status,submitted_at,assigned_at,block:blocks(code)", order: "submitted_at" },
    { table: "maintenance_jobs", columns: "job_no,room_no,category,priority,status,work_state,assigned_at,started_at,completed_at,scheduled_for,block:blocks(code),staff:profiles!maintenance_jobs_assigned_to_fkey(full_name)", order: "assigned_at" },
    { table: "admin_daily_tasks", columns: "id,title,task_date,status,task_category,created_at,started_at,completed_at,staff:profiles!admin_daily_tasks_assigned_to_fkey(full_name)", order: "task_date" },
    { table: "inventory_items", columns: "item_code,description,category,balance_qty,reorder_level,unit,updated_at,is_active", order: "item_code" },
    { table: "inventory_issue_history", columns: "id,qty,issued_at,item:inventory_items(item_code,description,unit),job:maintenance_jobs(job_no,room_no),staff:profiles!inventory_issue_history_staff_id_fkey(full_name)", order: "issued_at" },
  ];
  const sources = await Promise.all(specs.map(async spec => {
    let query = db.from(spec.table).select(spec.columns, { count: "exact" }).order(spec.order, { ascending: spec.table === "inventory_items" }).limit(spec.table === "inventory_items" ? 1000 : 500);
    if (spec.table === "inventory_items") query = query.eq("is_active", true);
    const { data, error, count } = await query;
    if (error || count === null) throw new Error(`Unable to read ${spec.table}. No analysis was sent.`);
    const records = (data ?? []) as unknown as Record<string, unknown>[];
    const summary = spec.table === "inventory_items"
      ? { loaded: records.length, lowStock: records.filter(row => Number(row.balance_qty) <= Number(row.reorder_level)).length }
      : spec.table === "complaints" ? complaintDateSummary(records)
      : spec.table === "inventory_issue_history" ? materialUsageSummary(records)
      : summarize(records);
    const room = question.match(/\b([a-d])\s*([0-9]{3,4})\b/i);
    const item = question.match(/\b[A-Z][0-9]{5}\b/i);
    const matching = records.filter(row => {
      if (room && ["complaints", "maintenance_jobs"].includes(spec.table)) {
        const block = row.block as { code?: string } | null;
        return String(row.room_no).replace(/\s/g, "").toLowerCase().replace(/^[a-d]/, "") === room[2] && block?.code?.toLowerCase() === room[1].toLowerCase();
      }
      if (item && spec.table === "inventory_items") return String(row.item_code).toLowerCase() === item[0].toLowerCase();
      return false;
    });
    const details = [...matching, ...records.filter(row => !matching.includes(row))].slice(0, 80);
    return { table: spec.table, visibleTotal: count, loaded: records.length, truncated: count > records.length, scope: spec.table === "inventory_items" ? "active items, first 1000 by item code" : "latest 500 records", summary, detailCount: Math.min(records.length, 80), detailScope: "First 80 of the loaded records; summary covers all loaded records", records: details };
  }));
  const now = new Date();
  return { capturedAt: now.toISOString(), capturedAtMalaysia: now.toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }) + " MYT", timezone: "Asia/Kuala_Lumpur", sources };
}
