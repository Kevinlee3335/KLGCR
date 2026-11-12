import { ArrowUpRight, Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ComplianceRecordForm } from "@/components/compliance-record-form";
import { requireRole } from "@/lib/auth";
import { listSupplierCompanies } from "@/lib/supplier-mail/queries";
import { createClient } from "@/lib/supabase/server";
import { ComplianceTabs } from "../compliance-tabs";
import { dateLabel, dueStatus, isRecordUuid, isSourceMessageId, recordFields, recordPath, sections, type ComplianceRecord } from "../record-model";
import styles from "../compliance.module.css";

type ListSearch = { error?: string; saved?: string; q?: string; supplierDocumentId?: string; sourceMessageId?: string };

export default async function ComplianceSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<ListSearch>;
}) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const [{ section: slug }, search] = await Promise.all([params, searchParams]);
  const section = sections.find(item => item.slug === slug);
  if (!section) notFound();
  const db = await createClient();
  const isAdmin = profile.role === "admin";
  const selectedArchive = isAdmin && isRecordUuid(search.supplierDocumentId) ? search.supplierDocumentId : undefined;
  const searchTerm = (typeof search.q === "string" ? search.q : "").trim().slice(0, 120);
  const [result, suppliers, archive] = await Promise.all([
    db.from("compliance_records").select(recordFields).eq("record_type", section.kind)
      .order("next_due_date", { ascending: true, nullsFirst: false }).order("title"),
    isAdmin && !selectedArchive ? listSupplierCompanies(db) : Promise.resolve([]),
    selectedArchive
      ? db.from("supplier_mail_documents").select("file_name").eq("id", selectedArchive).maybeSingle()
      : Promise.resolve(null),
  ]);
  const records = ((result.data ?? []) as ComplianceRecord[]).filter(record =>
    !searchTerm || [record.title, record.provider, record.location, record.reference_no].some(value => value?.toLowerCase().includes(searchTerm.toLowerCase())),
  );
  const linkDocumentId = archive?.data ? selectedArchive : undefined;
  const sourceMessageId = linkDocumentId && isSourceMessageId(search.sourceMessageId) ? search.sourceMessageId : undefined;

  return (
    <AppShell profile={profile} title="Cert & Servicing">
      <div className={styles.module}>
        <ComplianceTabs active={section} supplierDocumentId={linkDocumentId} sourceMessageId={sourceMessageId} />
        {search.error && <p className="error" role="alert">{search.error}</p>}
        {search.saved && <p className="success" role="status">Record saved.</p>}
        {selectedArchive && !archive?.data && <p className="error" role="alert">This supplier PDF could not be loaded.</p>}
        <section className="panel list-panel" aria-labelledby="compliance-section-title">
          <div className={styles.heading}>
            <div>
              <h2 id="compliance-section-title">{section.title}</h2>
              {archive?.data && <p className="subtle">Choose the record for <strong>{archive.data.file_name}</strong>.</p>}
            </div>
            <div className={styles.actions}>
              <a href={`/api/cert-servicing/print?kind=${section.kind}`} className="button secondary">
                <Printer size={16} aria-hidden="true" /> Print in Excel
              </a>
              {isAdmin && <Link href="/admin/cert-servicing/print-template" className="button secondary">Print template</Link>}
            </div>
          </div>
          <form className={`${styles.search} ${styles.tableRegion}`}>
            {linkDocumentId && <input type="hidden" name="supplierDocumentId" value={linkDocumentId} />}
            {sourceMessageId && <input type="hidden" name="sourceMessageId" value={sourceMessageId} />}
            <label><span className={styles.srOnly}>Search records</span><input name="q" type="search" defaultValue={searchTerm} maxLength={120} placeholder="Search name, supplier, block or reference…" /></label>
            <button type="submit" className="button secondary">Search</button>
          </form>
          {result.error ? <p className="error" role="alert">Unable to load records. Please try again.</p> : records.length ? (
            <div className={`table-wrap ${styles.tableRegion}`} role="region" aria-label={section.title} tabIndex={0}>
              <table className="table">
                <thead><tr>
                  <th scope="col">Record</th>
                  <th scope="col">Provider / Contact</th>
                  <th scope="col">Frequency</th>
                  <th scope="col">Last completed</th>
                  <th scope="col">Due date</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className={styles.srOnly}>Open</span></th>
                </tr></thead>
                <tbody>{records.map(record => {
                  const status = dueStatus(record.next_due_date, record.status);
                  return (
                    <tr key={record.id}>
                      <td><strong>{record.title}</strong>{(record.location || record.reference_no) && <small>{[record.location, record.reference_no].filter(Boolean).join(" · ")}</small>}</td>
                      <td>{record.provider || "—"}{record.contact_name && <small>{record.contact_name}</small>}</td>
                      <td>{record.frequency || "—"}</td>
                      <td>{dateLabel(record.last_completed_date)}</td>
                      <td>{dateLabel(record.next_due_date)}</td>
                      <td><span className={`${styles.status} ${styles[status.tone] ?? ""}`}>{status.label}</span></td>
                      <td><Link href={recordPath(record.id, linkDocumentId, sourceMessageId)} className={styles.recordLink} aria-label={`${linkDocumentId ? "Select" : "Open"} ${record.title}`}>{linkDocumentId ? "Select" : "Open"} <ArrowUpRight size={13} aria-hidden="true" /></Link></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : <p className="subtle">{searchTerm ? "No records match your search." : "No records found."}</p>}
        </section>
        {isAdmin && !selectedArchive && <details className={`panel ${styles.editor}`}>
          <summary>Add {section.singular}</summary>
          <ComplianceRecordForm section={section} suppliers={suppliers} />
        </details>}
      </div>
    </AppShell>
  );
}
