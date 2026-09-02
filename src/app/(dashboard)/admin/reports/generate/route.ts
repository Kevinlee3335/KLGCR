import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildReport, type BlockGroup, type ReportKind } from "@/lib/reporting";

const kinds = new Set<ReportKind>(["morning_tasks","midday_update","daily_summary","progress_snapshot","inventory_report"]);
const groups = new Set<BlockGroup>(["AB","CD","ALL"]);

export async function POST(request: Request) {
  const profile = await requireRole(["admin"]);
  const form = await request.formData();
  const reportType = String(form.get("reportType") ?? "progress_snapshot") as ReportKind;
  const blockGroup = String(form.get("blockGroup") ?? "AB") as BlockGroup;
  if (!kinds.has(reportType) || !groups.has(blockGroup)) return NextResponse.redirect(new URL("/admin/reports?error=invalid", request.url), 303);
  const supabase = await createClient();
  const built = await buildReport(supabase, reportType, blockGroup);
  const { error } = await supabase.from("report_snapshots").insert({ report_type:reportType, report_date:built.reportDate, block_group:blockGroup, payload:built.payload, whatsapp_text:built.whatsappText, source:"manual", created_by:profile.id });
  if (error) return NextResponse.redirect(new URL(`/admin/reports?error=${encodeURIComponent(error.message)}`, request.url), 303);
  return NextResponse.redirect(new URL("/admin/reports", request.url), 303);
}
