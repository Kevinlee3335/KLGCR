import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function csvCell(value: unknown) { return `"${String(value ?? "").replaceAll('"','""')}"`; }
function htmlEscape(value: unknown) { return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }

export async function GET(request: Request) {
  await requireRole(["admin","management_viewer"]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("report_snapshots").select("report_date,report_type,block_group,source,created_at,whatsapp_text").order("created_at",{ascending:false}).limit(500);
  if (error) return new Response(error.message,{status:500});
  const rows = data ?? [];
  const format = new URL(request.url).searchParams.get("format") === "xls" ? "xls" : "csv";
  if (format === "xls") {
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1"><tr><th>Date</th><th>Type</th><th>Block Group</th><th>Source</th><th>Created At</th><th>WhatsApp Summary</th></tr>${rows.map(r=>`<tr><td>${htmlEscape(r.report_date)}</td><td>${htmlEscape(r.report_type)}</td><td>${htmlEscape(r.block_group)}</td><td>${htmlEscape(r.source)}</td><td>${htmlEscape(r.created_at)}</td><td>${htmlEscape(r.whatsapp_text)}</td></tr>`).join("")}</table></body></html>`;
    return new Response(html,{headers:{"Content-Type":"application/vnd.ms-excel; charset=utf-8","Content-Disposition":"attachment; filename=KLGCR-Reports.xls"}});
  }
  const csv = ["Date,Type,Block Group,Source,Created At,WhatsApp Summary",...rows.map(r=>[r.report_date,r.report_type,r.block_group,r.source,r.created_at,r.whatsapp_text].map(csvCell).join(","))].join("\r\n");
  return new Response(`\ufeff${csv}`,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=KLGCR-Reports.csv"}});
}
