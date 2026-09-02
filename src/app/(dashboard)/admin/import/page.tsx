import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ImportPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const profile = await requireRole(["admin","management_viewer"]);
  const params = await searchParams;
  const supabase = await createClient();
  const { data: history } = await supabase.from("google_import_history").select("id,file_name,total_rows,imported_rows,skipped_rows,error_rows,notes,created_at,profiles!google_import_history_imported_by_fkey(full_name)").order("created_at",{ascending:false}).limit(15);
  const isAdmin = profile.role === "admin";
  return <AppShell profile={profile} title="Google Import">
    <div className="section-head"><div><h2>Google Form / Google Sheet Import</h2><p className="subtle">No Google API is required. Export the response Sheet as CSV, or copy rows from Google Sheet and paste them here. Imported rows always enter as <strong>New Complaints</strong> for Admin review.</p></div></div>
    {params.ok && <p className="success">Import completed: {params.ok} new complaint(s), {params.skipped ?? 0} skipped.</p>}{params.error && <p className="error">{params.error}</p>}
    {isAdmin && <section className="panel page-narrow"><h3>Import response rows</h3><p className="subtle">Required columns: Block, Room, Category, Description. Optional: Name, Contact, Priority, Photo URL, Response ID. Google Drive photo links can be stored in Photo URL.</p><form action="/admin/import/action" method="post" encType="multipart/form-data"><div className="field"><label>CSV file from Google Sheet</label><input type="file" name="file" accept=".csv,text/csv,text/plain"/></div><div className="field"><label>Or paste Google Sheet rows</label><textarea name="pasted" rows={10} placeholder={'Block,Room,Category,Description,Name,Contact,Priority,Photo URL,Response ID\nA,A101,Plumbing,Water leaking,Student,0123456789,normal,https://drive.google.com/...,FORM-001'}/></div><button className="button" type="submit">Import as New Complaints</button></form></section>}
    <section className="panel" style={{marginTop:18}}><h3>Import History</h3>{!history?.length?<p className="subtle">No import history yet.</p>:<div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>File</th><th>Total</th><th>Imported</th><th>Skipped</th><th>Errors</th><th>Notes</th></tr></thead><tbody>{history.map((h)=><tr key={h.id}><td>{new Date(h.created_at).toLocaleString("en-MY",{timeZone:"Asia/Kuala_Lumpur"})}</td><td>{h.file_name || "Pasted rows"}</td><td>{h.total_rows}</td><td>{h.imported_rows}</td><td>{h.skipped_rows}</td><td>{h.error_rows}</td><td>{h.notes}</td></tr>)}</tbody></table></div>}</section>
  </AppShell>;
}
