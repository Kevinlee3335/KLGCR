import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  await requireRole(["admin"]);
  const form = await request.formData();
  const jobId = String(form.get("jobId") ?? "");
  const date = String(form.get("date") ?? "");
  if (!jobId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.redirect(new URL("/admin/daily-tasks?error=invalid",request.url),303);
  const supabase = await createClient();
  const { error } = await supabase.rpc("schedule_job",{p_job_id:jobId,p_date:date});
  if (error) return NextResponse.redirect(new URL(`/admin/daily-tasks?error=${encodeURIComponent(error.message)}`,request.url),303);
  return NextResponse.redirect(new URL(`/admin/daily-tasks?date=${date}`,request.url),303);
}
