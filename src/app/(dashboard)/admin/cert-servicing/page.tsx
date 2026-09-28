import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ComplianceRecordForm } from "@/components/compliance-record-form";

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default async function CertServicingPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const query = await searchParams;
  const db = await createClient();
  const { data: records, error } = await db.from("compliance_records")
    .select("id,record_type,title,provider,reference_no,last_completed_date,next_due_date,status,frequency,contact_name,contact_phone,notes")
    .order("next_due_date", { ascending: true });

  return <AppShell profile={profile} title="Cert & Servicing">
    <div className="section-head"><div><p className="eyebrow">Compliance</p><h2>Cert & Servicing</h2><p className="subtle">Review certificate and servicing dates. Use Edit to correct a record.</p></div></div>
    {query.error && <p className="error">{query.error}</p>}{query.saved && <p className="success">Record saved.</p>}{error && <p className="error">{error.message}</p>}
    {profile.role === "admin" && <details className="panel"><summary><strong>Add certificate or servicing record</strong></summary><ComplianceRecordForm/></details>}
    <section className="panel list-panel"><div className="table-wrap"><table className="table"><thead><tr><th>Type</th><th>Title</th><th>Provider / Contact</th><th>Frequency</th><th>Last Completed</th><th>Next Due</th><th>Status</th><th>Action</th></tr></thead><tbody>{(records || []).map((record) => <tr key={record.id}><td>{label(record.record_type)}</td><td><strong>{record.title}</strong>{record.reference_no && <small> · {record.reference_no}</small>}</td><td>{record.provider || "—"}{record.contact_name && <small> · {record.contact_name}</small>}</td><td>{record.frequency || "—"}</td><td>{record.last_completed_date || "—"}</td><td>{new Date(record.next_due_date + "T12:00:00").toLocaleDateString("en-MY")}</td><td><span className={"status-badge status-" + record.status}>{label(record.status)}</span></td><td>{profile.role==="admin"&&<details><summary>Edit</summary><ComplianceRecordForm record={record}/></details>}</td></tr>)}</tbody></table></div>{!(records || []).length && <p className="subtle">No records found.</p>}</section>
  </AppShell>;
}
