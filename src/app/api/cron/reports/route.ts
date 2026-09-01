import { createClient } from "@supabase/supabase-js";
import { buildReport, type ReportKind } from "@/lib/reporting";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment is incomplete");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

function expectedKind(now = new Date()): ReportKind {
  const parts = new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kuala_Lumpur",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(now);
  const hour = Number(parts.find(p=>p.type==="hour")?.value ?? 0);
  const minute = Number(parts.find(p=>p.type==="minute")?.value ?? 0);
  if (hour === 9 && minute < 15) return "morning_tasks";
  if (hour === 12 && minute < 15) return "midday_update";
  if (hour === 16 && minute >= 45) return "daily_summary";
  return "progress_snapshot";
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized",{status:401});
  const supabase = serviceClient();
  const kind = expectedKind();
  const created: string[] = [];
  for (const group of ["AB","CD"] as const) {
    const built = await buildReport(supabase,kind,group);
    const { error } = await supabase.from("report_snapshots").insert({report_type:kind,report_date:built.reportDate,block_group:group,payload:built.payload,whatsapp_text:built.whatsappText,source:"automatic",created_by:null});
    if (error) return Response.json({ok:false,error:error.message},{status:500});
    created.push(`${kind}-${group}`);
  }
  if (kind === "daily_summary") {
    const inventory = await buildReport(supabase,"inventory_report","ALL");
    const { error } = await supabase.from("report_snapshots").insert({report_type:"inventory_report",report_date:inventory.reportDate,block_group:"ALL",payload:inventory.payload,whatsapp_text:inventory.whatsappText,source:"automatic",created_by:null});
    if (error) return Response.json({ok:false,error:error.message},{status:500});
    created.push("inventory_report-ALL");
  }
  return Response.json({ok:true,created});
}
