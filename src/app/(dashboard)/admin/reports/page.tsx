import { AppShell } from "@/components/app-shell";
import { CopyWhatsAppButton } from "@/components/copy-whatsapp-button";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const labels: Record<string,string> = { morning_tasks:"9:00 AM Morning Daily Task", midday_update:"12:00 PM Midday Update", daily_summary:"4:50 PM Daily Summary", progress_snapshot:"3-Hour Progress Snapshot", inventory_report:"Inventory Report" };

export default async function ReportsPage() {
  const profile = await requireRole(["admin","management_viewer"]);
  const supabase = await createClient();
  const { data: reports } = await supabase.from("report_snapshots").select("id,report_type,report_date,block_group,whatsapp_text,source,created_at").order("created_at", { ascending:false }).limit(40);
  const isAdmin = profile.role === "admin";
  return <AppShell profile={profile} title="Reports">
    <div className="section-head"><div><h2>Reports & WhatsApp Summary</h2><p className="subtle">9AM, 12PM, 4:50PM and every 3-hour snapshots are saved here. AB and CD are kept separate.</p></div></div>
    {isAdmin && <div className="panel"><h3>Generate Report Now</h3><form action="/admin/reports/generate" method="post" className="inline-form"><select name="reportType" defaultValue="progress_snapshot"><option value="morning_tasks">9AM Morning Tasks</option><option value="midday_update">12PM Midday Update</option><option value="daily_summary">4:50PM Daily Summary</option><option value="progress_snapshot">3-Hour Snapshot</option><option value="inventory_report">Inventory Report</option></select><select name="blockGroup" defaultValue="AB"><option>AB</option><option>CD</option><option>ALL</option></select><button className="button" type="submit">Generate Now</button></form></div>}
    <div className="panel" style={{marginTop:18}}><div className="section-head"><h3>Report History</h3><div className="actions"><a className="button secondary button-link" href="/admin/reports/export?format=csv">CSV</a><a className="button secondary button-link" href="/admin/reports/export?format=xls">Excel</a></div></div>
      {!reports?.length ? <div className="empty"><div><strong>No reports yet</strong>Generate one now or wait for the automatic schedule.</div></div> : <div className="mobile-cards" style={{display:"grid"}}>{reports.map((r) => <article className="panel record-card" key={r.id}><div className="record-head"><strong>{labels[r.report_type] ?? r.report_type} · {r.block_group}</strong><span className="badge">{r.source}</span></div><div className="record-meta"><span>{r.report_date}</span><span>{new Date(r.created_at).toLocaleString("en-MY",{timeZone:"Asia/Kuala_Lumpur"})}</span></div><pre style={{whiteSpace:"pre-wrap",fontFamily:"inherit",lineHeight:1.5,marginTop:16}}>{r.whatsapp_text}</pre><CopyWhatsAppButton text={r.whatsapp_text}/></article>)}</div>}
    </div>
  </AppShell>;
}
