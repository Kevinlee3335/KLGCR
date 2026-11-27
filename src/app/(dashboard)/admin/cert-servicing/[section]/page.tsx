import { Suspense } from "react";
import { malaysiaDate } from "@/lib/monitoring-follow-up";
import { complianceScheduleLabel } from "@/lib/compliance-schedule";
import { ArrowUpRight, ChevronDown, Plus, Printer, Search, Settings2, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ComplianceRecordForm } from "@/components/compliance-record-form";
import controls from "@/components/compliance-controls.module.css";
import { requireRole } from "@/lib/auth";
import { listSupplierCompanies } from "@/lib/supplier-mail/queries";
import { createClient } from "@/lib/supabase/server";
import { ComplianceTabs } from "../compliance-tabs";
import { dateLabel, dueStatus, isRecordUuid, isSourceMessageId, recordPath, sectionPath, sections, type ComplianceSection } from "../record-model";
import list from "../compliance-list.module.css";
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
  const records = readRecords(db, section);
  const archive = selectedArchive
    ? await db.from("supplier_mail_documents").select("file_name").eq("id", selectedArchive).maybeSingle()
    : null;
  const linkDocumentId = archive?.data ? selectedArchive : undefined;
  const sourceMessageId = linkDocumentId && isSourceMessageId(search.sourceMessageId) ? search.sourceMessageId : undefined;

  return (
    <AppShell profile={profile} title="Cert & Servicing">
      <div className={styles.module}>
        <ComplianceTabs active={section} supplierDocumentId={linkDocumentId} sourceMessageId={sourceMessageId} />
        {search.error && <p className="error" role="alert">{search.error}</p>}
        {search.saved && <p className="success" role="status">Record saved.</p>}
        {selectedArchive && !archive?.data && <p className="error" role="alert">This supplier PDF could not be loaded.</p>}
        <section className={list.panel} aria-labelledby="compliance-section-title">
          <div className={list.toolbar}>
            <div className={list.heading}>
              <div>
                <h2 id="compliance-section-title">{section.title}</h2>
                {archive?.data && <p className="subtle">Choose the record for <strong>{archive.data.file_name}</strong>.</p>}
              </div>
              <div className={list.actions}>
                <a href={`/api/cert-servicing/print?kind=${section.kind}`} className={`${controls.button} ${controls.secondary}`}>
                  <Printer size={16} aria-hidden="true" /> Print in Excel
                </a>
                {isAdmin && (
                  <Link href="/admin/cert-servicing/print-template" className={`${controls.button} ${controls.quiet}`}>
                    <Settings2 size={16} aria-hidden="true" /> Print template
                  </Link>
                )}
              </div>
            </div>
            <form className={list.search} method="get" role="search" aria-label="Search records">
              {linkDocumentId && <input type="hidden" name="supplierDocumentId" value={linkDocumentId} />}
              {sourceMessageId && <input type="hidden" name="sourceMessageId" value={sourceMessageId} />}
              <label className={list.searchField}>
                <span className={styles.srOnly}>Search records</span>
                <Search className={list.searchIcon} size={18} aria-hidden="true" />
                <input
                  key={searchTerm}
                  className={controls.input}
                  name="q"
                  type="search"
                  defaultValue={searchTerm}
                  maxLength={120}
                  placeholder="Name, supplier, block or reference"
                />
              </label>
              <button type="submit" className={`${controls.button} ${controls.primary} ${list.searchSubmit}`}>Search</button>
              {searchTerm && (
                <Link href={sectionPath(section, linkDocumentId, sourceMessageId)} className={`${controls.button} ${controls.quiet}`} aria-label="Clear search">
                  <X size={15} aria-hidden="true" /> Clear
                </Link>
              )}
            </form>
          </div>
          <Suspense key={JSON.stringify([section.slug, searchTerm, linkDocumentId, sourceMessageId])}
            fallback={<p className={list.empty} role="status">Loading records…</p>}>
            <RecordTable result={records} section={section} searchTerm={searchTerm} linkDocumentId={linkDocumentId} sourceMessageId={sourceMessageId}/>
          </Suspense>
        </section>
        {isAdmin && !selectedArchive && <details className={list.editor}>
          <summary className={`${controls.button} ${controls.secondary}`}>
            <Plus size={16} aria-hidden="true" /> Add {section.singular}
            <ChevronDown className={list.addChevron} size={16} aria-hidden="true" />
          </summary>
          <Suspense fallback={<p className="subtle" role="status">Loading record form…</p>}>
            <AddRecordForm section={section} db={db}/>
          </Suspense>
        </details>}
      </div>
    </AppShell>
  );
}

type Database = Awaited<ReturnType<typeof createClient>>;

async function AddRecordForm({ section, db }: { section: ComplianceSection; db: Database }) {
  return <ComplianceRecordForm section={section} suppliers={await listSupplierCompanies(db)}/>;
}

async function readRecords(db: Database, section: ComplianceSection) {
  return await db.from("compliance_records")
    .select("id,title,provider,location,reference_no,contact_name,frequency,last_completed_date,next_due_date,status,compliance_cycles(scheduled_on,scheduled_time,schedule_notes)")
    .eq("record_type", section.kind).eq("compliance_cycles.status", "open")
    .order("next_due_date", { ascending: true, nullsFirst: false }).order("title");
}

async function RecordTable({ result, section, searchTerm, linkDocumentId, sourceMessageId }: {
  result: ReturnType<typeof readRecords>; section: ComplianceSection; searchTerm: string; linkDocumentId?: string; sourceMessageId?: string;
}) {
  const { data, error } = await result;
  if (error) return <p className={`error ${list.empty}`} role="alert">Unable to load records. Please try again.</p>;
  const term = searchTerm.toLowerCase();
  const records = (data ?? []).filter(record =>
    !term || [record.title, record.provider, record.location, record.reference_no].some(value => value?.toLowerCase().includes(term))
  );
  if (!records.length) return <p className={`subtle ${list.empty}`}>{searchTerm ? "No records match your search." : "No records found."}</p>;
  const recordAction = linkDocumentId ? "Select" : "Open";
  const today = malaysiaDate();
  return (
    <div className={list.tableRegion} role="region" aria-label={section.title} tabIndex={0}>
      <table className={list.table} role="table">
        <thead role="rowgroup"><tr role="row">
          <th scope="col" role="columnheader">Record</th>
          <th scope="col" role="columnheader">Provider / Contact</th>
          <th scope="col" role="columnheader">Frequency</th>
          <th scope="col" role="columnheader">Last completed</th>
          <th scope="col" role="columnheader">Due date</th>
          <th scope="col" role="columnheader">Scheduled for</th>
          <th scope="col" role="columnheader">Status</th>
          <th scope="col" role="columnheader"><span className={styles.srOnly}>{recordAction}</span></th>
        </tr></thead>
        <tbody role="rowgroup">{records.map(record => {
          const status = dueStatus(record.next_due_date, record.status, today);
          const schedule = record.compliance_cycles?.[0];
          return (
            <tr key={record.id} role="row">
              <td className={list.record} role="cell">
                <strong>{record.title}</strong>
                {(record.location || record.reference_no) && <small>{[record.location, record.reference_no].filter(Boolean).join(" · ")}</small>}
              </td>
              <td className={list.provider} role="cell">
                <span className={list.cellLabel} aria-hidden="true">Provider / Contact</span>
                {record.provider || "—"}
                {record.contact_name && <small>{record.contact_name}</small>}
              </td>
              <td role="cell">
                <span className={list.cellLabel} aria-hidden="true">Frequency</span>
                {record.frequency || "—"}
              </td>
              <td className={list.date} role="cell">
                <span className={list.cellLabel} aria-hidden="true">Last completed</span>
                {dateLabel(record.last_completed_date)}
              </td>
              <td className={`${list.date} ${list.dueDate}`} role="cell">
                <span className={list.cellLabel} aria-hidden="true">Due date</span>
                {dateLabel(record.next_due_date)}
              </td>
              <td className={list.schedule} role="cell">
                <span className={list.cellLabel} aria-hidden="true">Scheduled for</span>
                {schedule?.scheduled_on?<><strong>{complianceScheduleLabel(schedule)}</strong>{schedule.schedule_notes&&<small>{schedule.schedule_notes}</small>}</>:"Not scheduled"}
              </td>
              <td role="cell">
                <span className={list.cellLabel} aria-hidden="true">Status</span>
                <span className={`${styles.status} ${styles[status.tone] ?? ""}`}>{status.label}</span>
              </td>
              <td className={list.rowAction} role="cell">
                <Link
                  href={recordPath(record.id, linkDocumentId, sourceMessageId)}
                  className={`${controls.button} ${controls.secondary} ${controls.small}`}
                  aria-label={`${recordAction} ${record.title}`}
                >
                  {recordAction} <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}
