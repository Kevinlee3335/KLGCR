import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveComplianceRecord } from "./actions";

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default async function CertServicingPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const query = await searchParams;
  const db = await createClient();
  const { data: records, error } = await db.from("compliance_records")
    .select("id,record_type,title,provider,reference_no,last_completed_date,next_due_date,status,frequency,contact_name,contact_phone,notes")
    .order("next_due_date", { ascending: true });

  return <AppShell profile={profile} title="Cert & Servicing">
    <div className="section-head"><div><p className="eyebrow">Compliance</p><h2>Cert & Servicing</h2><p className="subtle">All existing certificates and servicing schedules are restored here.</p></div></div>
    {query.error && <p className="error">{query.error}</p>}{query.saved && <p className="success">Record saved.</p>}{error && <p className="error">{error.message}</p>}
    {profile.role === "admin" && <details className="panel" open={false}><summary><strong>Add certificate or servicing record</strong></summary><form action={saveComplianceRecord} className="form-grid" style={{ marginTop: 16 }}>
      <label className="field"><span>Type *</span><select name="recordType"><option value="servicing">Servicing</option><option value="certificate">Certificate</option></select></label>
      <label className="field"><span>Title *</span><input name="title" required /></label>
      <label className="field"><span>Provider</span><input name="provider" /></label>
      <label className="field"><span>Reference No.</span><input name="referenceNo" /></label>
      <label className="field"><span>Last completed date</span><input name="lastCompletedDate" type="date" /></label>
      <label className="field"><span>Next due date *</span><input name="nextDueDate" type="date" required /></label>
      <label className="field"><span>Frequency</span><input name="frequency" placeholder="Monthly / Yearly" /></label>
      <label className="field"><span>Contact name</span><input name="contactName" /></label>
      <label className="field"><span>Contact phone</span><input name="contactPhone" /></label>
      <label className="field field-wide"><span>Notes</span><textarea name="notes" rows={3}/></label><button className="button">Save record</button>
    </form></details>}
    <section className="panel list-panel"><div className="table-wrap"><table className="table"><thead><tr><th>Type</th><th>Title</th><th>Provider / Contact</th><th>Frequency</th><th>Next Due</th><th>Status</th></tr></thead><tbody>{(records || []).map((record) => <tr key={record.id}><td>{label(record.record_type)}</td><td><strong>{record.title}</strong>{record.reference_no && <small> · {record.reference_no}</small>}</td><td>{record.provider || "—"}{record.contact_name && <small> · {record.contact_name}</small>}</td><td>{record.frequency || "—"}</td><td>{new Date(record.next_due_date + "T12:00:00").toLocaleDateString("en-MY")}</td><td><span className={"status-badge status-" + record.status}>{label(record.status)}</span></td></tr>)}</tbody></table></div>{!(records || []).length && <p className="subtle">No records found.</p>}</section>
  </AppShell>;
}
