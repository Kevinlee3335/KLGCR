import { ArrowLeft, CalendarDays, ChevronDown, CircleCheck, History, Pencil, Save } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import controls from "@/components/compliance-controls.module.css";
import { CompliancePdfUpload } from "@/components/compliance-pdf-upload";
import { ComplianceRecordForm } from "@/components/compliance-record-form";
import { SubmitButton } from "@/components/submit-button";
import { requireRole } from "@/lib/auth";
import { listSupplierCompanies } from "@/lib/supplier-mail/queries";
import { createClient } from "@/lib/supabase/server";
import { completeComplianceCycle, saveComplianceCycleProgress } from "../../actions";
import { ComplianceTabs } from "../../compliance-tabs";
import {
  completionStage, dateLabel, documentFields, dueStatus, evidenceLabels, isRecordUuid, isSourceMessageId, recordFields,
  sectionForRecord, sectionPath, timestampLabel, type ArchiveChoice, type ArchiveEmail, type ComplianceCycle,
  type ComplianceDelivery, type ComplianceDocument, type ComplianceRecord,
} from "../../record-model";
import { ArchivePicker, DocumentList } from "./record-documents";
import styles from "../../compliance.module.css";

type DetailSearch = {
  error?: string;
  saved?: string;
  linked?: string;
  reviewed?: string;
  progress?: string;
  completed?: string;
  supplierDocumentId?: string;
  sourceMessageId?: string;
  archiveQ?: string;
  allSuppliers?: string;
  focusCycle?: string;
};

type Db = Awaited<ReturnType<typeof createClient>>;
const archiveFields = "id,company,file_name,folder,created_at,supplier_mail_attachments(supplier_emails(id,subject,received_at))";
type ArchiveRow = Omit<ArchiveChoice, "email" | "emails"> & {
  supplier_mail_attachments: { supplier_emails: ArchiveEmail | ArchiveEmail[] | null }[];
};

function mapArchive(rows: ArchiveRow[], selectedSourceId?: string) {
  return rows.map(({ supplier_mail_attachments: attachments, ...row }) => {
    const emails = attachments.flatMap(attachment => attachment.supplier_emails ?? [])
      .sort((a, b) => b.received_at.localeCompare(a.received_at));
    return { ...row, email: selectedSourceId ? emails.find(email => email.id === selectedSourceId) ?? null : emails[0] ?? null, emails };
  });
}

async function archiveChoices(db: Db, {
  selectedId,
  selectedSourceId,
  supplierKey,
  searchTerm,
  allSuppliers,
}: {
  selectedId?: string;
  selectedSourceId?: string;
  supplierKey: string | null;
  searchTerm: string;
  allSuppliers: boolean;
}) {
  if (!selectedId && !supplierKey && !searchTerm) return { choices: [], error: false };
  let query = db.from("supplier_mail_documents").select(archiveFields);
  if (selectedId) query = query.eq("id", selectedId);
  else if (supplierKey && !allSuppliers) query = query.eq("company", supplierKey);
  if (searchTerm && !selectedId) {
    for (const term of searchTerm.split(/\s+/)) query = query.ilike("file_name", `%${term}%`);
  }
  const result = await query.order("created_at", { ascending: false }).order("id").limit(25);
  const choices = mapArchive((result.data ?? []) as ArchiveRow[], selectedSourceId);
  return { choices, error: Boolean(result.error || (selectedSourceId && choices.some(choice => !choice.email))) };
}

function workLabel(kind: ComplianceRecord["record_type"]) {
  if (kind === "agreement") return "Renewal signed on";
  return kind === "servicing" ? "Work completed on" : "Renewed / returned on";
}

function CycleDates({ cycle }: { cycle: ComplianceCycle }) {
  return (
    <dl className={styles.dateGrid}>
      <div><dt>Due date</dt><dd>{dateLabel(cycle.due_date, "Date needed")}</dd></div>
      {cycle.original_due_date && cycle.original_due_date !== cycle.due_date && (
        <div><dt>Original due date</dt><dd>{dateLabel(cycle.original_due_date)}</dd></div>
      )}
      {cycle.effective_date && <div><dt>Effective date</dt><dd>{dateLabel(cycle.effective_date)}</dd></div>}
      <div><dt>Actual completion / return</dt><dd>{dateLabel(cycle.performed_on, "Pending")}</dd></div>
      {cycle.completed_at && <div><dt>Cycle closed</dt><dd>{timestampLabel(cycle.completed_at)}</dd></div>}
      {cycle.next_due_date && <div><dt>Next due date</dt><dd>{dateLabel(cycle.next_due_date)}</dd></div>}
      {cycle.next_effective_date && <div><dt>Next effective date</dt><dd>{dateLabel(cycle.next_effective_date)}</dd></div>}
    </dl>
  );
}

export default async function ComplianceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<DetailSearch>;
}) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isRecordUuid(id)) notFound();
  const isAdmin = profile.role === "admin";
  const db = await createClient();
  const [recordResult, cycleResult, suppliers] = await Promise.all([
    db.from("compliance_records").select(recordFields).eq("id", id).maybeSingle(),
    db.from("compliance_cycles").select("id,record_id,due_date,original_due_date,effective_date,completed_at,performed_on,next_due_date,next_effective_date,requires_invoice,required_evidence,notes,status,created_at")
      .eq("record_id", id).order("created_at", { ascending: false }).order("due_date", { ascending: false, nullsFirst: false }),
    isAdmin ? listSupplierCompanies(db) : Promise.resolve([]),
  ]);
  if (recordResult.error || cycleResult.error) return <AppShell profile={profile} title="Cert & Servicing">
    <p className="error" role="alert">Unable to load this record and its cycles. Please try again.</p>
  </AppShell>;
  if (!recordResult.data) notFound();
  const record = recordResult.data as ComplianceRecord;
  const cycles = (cycleResult.data ?? []) as ComplianceCycle[];
  const current = cycles.find(cycle => cycle.status === "open");
  const history = cycles.filter(cycle => cycle.status === "completed");
  const section = sectionForRecord(record.record_type);
  const selectedArchive = isAdmin && isRecordUuid(query.supplierDocumentId) ? query.supplierDocumentId : undefined;
  const sourceMessageId = selectedArchive && isSourceMessageId(query.sourceMessageId) ? query.sourceMessageId : undefined;
  const searchTerm = (typeof query.archiveQ === "string" ? query.archiveQ : "").replace(/[%_,()]/g, " ").trim().slice(0, 120);
  const allSuppliers = query.allSuppliers === "1";
  const [documentResult, picker] = await Promise.all([
    cycles.length
      ? db.from("compliance_cycle_documents").select(documentFields).in("cycle_id", cycles.map(cycle => cycle.id)).order("created_at").order("id")
      : Promise.resolve({ data: [], error: null }),
    isAdmin && current
      ? archiveChoices(db, { selectedId: selectedArchive, selectedSourceId: sourceMessageId, supplierKey: record.supplier_key, searchTerm, allSuppliers })
      : Promise.resolve({ choices: [], error: false }),
  ]);
  const documents = (documentResult.data ?? []) as ComplianceDocument[];
  const documentsByCycle = new Map<string, ComplianceDocument[]>();
  for (const document of documents) {
    const existing = documentsByCycle.get(document.cycle_id) ?? [];
    existing.push(document);
    documentsByCycle.set(document.cycle_id, existing);
  }
  const sourceIds = [...new Set(documents.flatMap(document => document.supplier_document_id ?? []))];
  const deliveryIds = documents.filter(document => document.review_stage === "approved").map(document => document.id);
  const [archived, deliveryResult] = await Promise.all([
    sourceIds.length
      ? db.from("supplier_mail_documents").select(archiveFields).in("id", sourceIds)
      : Promise.resolve({ data: [] }),
    deliveryIds.length
      ? db.from("compliance_document_delivery").select("document_id,status,recipient,attempted_at,sent_at,error").in("document_id", deliveryIds)
      : Promise.resolve({ data: [] }),
  ]);
  const archive = new Map(mapArchive((archived.data ?? []) as ArchiveRow[]).map(item => [item.id, item]));
  const deliveries = new Map(((deliveryResult.data ?? []) as ComplianceDelivery[]).map(item => [item.document_id, item]));
  const currentDocs = current ? documentsByCycle.get(current.id) ?? [] : [];
  const recordRequirements = record.required_evidence ?? [];
  const requirements = current?.requires_invoice && !recordRequirements.includes("invoice")
    ? [...recordRequirements, "invoice" as const]
    : recordRequirements;
  const required = requirements.map(kind => {
    const matching = currentDocs.filter(document => document.kind === kind);
    const complete = matching.some(completionStage);
    return { kind, complete, label: complete ? "Ready" : matching.length ? "Awaiting review" : "PDF needed" };
  });
  const missing = required.filter(requirement => !requirement.complete);
  const invoiceNeeded = current?.performed_on && missing.some(requirement => requirement.kind === "invoice");
  const invoices = currentDocs.filter(document => document.kind === "invoice");
  const invoiceStatus = invoices.some(document => document.review_stage === "james")
    ? "Pending Invoice Approval"
    : invoices.length ? "Pending Invoice Verification" : "Awaiting Invoice";
  const status = invoiceNeeded
    ? { label: invoiceStatus, tone: "pending" }
    : dueStatus(current?.due_date ?? record.next_due_date, record.status);
  const sourceAlreadyLinked = selectedArchive && currentDocs.some(document => document.supplier_document_id === selectedArchive);
  const candidateIds = new Set(currentDocs.flatMap(document => document.supplier_document_id ?? []));
  const candidates = picker.choices.filter(choice => !candidateIds.has(choice.id));
  const subtitle = [record.location, record.provider, record.reference_no].filter(Boolean).join(" · ");
  const confirmation = query.completed ? "Cycle completed and saved to history."
    : query.reviewed ? "Document review saved."
    : query.linked ? "Supplier PDF linked to this cycle."
    : query.progress ? "Cycle progress saved."
    : query.saved ? "Record saved." : null;

  return (
    <AppShell profile={profile} title="Cert & Servicing">
      <div className={styles.module}>
        <ComplianceTabs active={section} />
        <Link href={sectionPath(section)} className={`${controls.button} ${controls.secondary} ${controls.small}`}>
          <ArrowLeft className={controls.icon} aria-hidden="true" /> {section.title}
        </Link>
        <header className={styles.heading}>
          <div><h2>{record.title}</h2>{subtitle && <p className="subtle">{subtitle}</p>}</div>
          <span className={`${styles.status} ${styles[status.tone] ?? ""}`}>{status.label}</span>
        </header>
        {query.error && <p className="error" role="alert">{query.error}</p>}
        {confirmation && <p className="success" role="status">{confirmation}</p>}
        {sourceAlreadyLinked && <p className="success" role="status">This PDF is already linked to the current cycle.</p>}
        {current ? (
          <section className="panel" aria-labelledby="current-cycle-heading" id="current-cycle">
            <div className={styles.heading}><h3 id="current-cycle-heading">Current cycle</h3></div>
            <CycleDates cycle={current} />
            {current.notes && <p className="subtle">{current.notes}</p>}
            {isAdmin && <details className={`${styles.editor} ${styles.finishForm}`}>
              <summary className={styles.disclosure}>
                <CalendarDays className={controls.icon} aria-hidden="true" />
                <span>Record work / return date</span>
                <ChevronDown className={styles.disclosureChevron} aria-hidden="true" />
              </summary>
              <form action={saveComplianceCycleProgress} className={styles.recordForm}>
                <input type="hidden" name="recordId" value={record.id} />
                <input type="hidden" name="cycleId" value={current.id} />
                <label className={controls.label}>{workLabel(record.record_type)}<input className={controls.input} name="performedOn" type="date" defaultValue={current.performed_on ?? ""} /></label>
                {!recordRequirements.includes("invoice") && <div className={styles.fullSpan}>
                  <input type="hidden" name="requiresInvoiceProvided" value="1" />
                  <label className={styles.archiveScope}><input type="checkbox" name="requiresInvoice" value="1" defaultChecked={current.requires_invoice} /> Invoice required for this cycle</label>
                </div>}
                <label className={`${controls.label} ${styles.fullSpan}`}>Cycle notes<textarea className={controls.input} name="notes" rows={2} defaultValue={current.notes ?? ""} maxLength={4000} /></label>
                <div className={styles.actions}><SubmitButton className={`${controls.button} ${controls.primary}`} pendingText="Saving…"><Save className={controls.icon} aria-hidden="true" /> Save progress</SubmitButton></div>
              </form>
            </details>}
            <div className={styles.evidenceGroup} id="cycle-documents">
              <h4 className={styles.groupTitle}>Cycle documents</h4>
              {documentResult.error ? <p role="alert" className="error">Unable to load cycle documents.</p> : (
                <DocumentList recordId={record.id} cycle={current} documents={currentDocs} archive={archive} deliveries={deliveries} adminId={isAdmin ? profile.id : null} />
              )}
              {isAdmin && <>
                <CompliancePdfUpload recordId={record.id} cycleId={current.id} />
                <ArchivePicker record={record} cycle={current} candidates={candidates} suppliers={suppliers} selectedArchive={sourceAlreadyLinked ? undefined : selectedArchive} sourceMessageId={sourceMessageId} searchTerm={searchTerm} allSuppliers={allSuppliers} loadError={picker.error} />
              </>}
            </div>
            {required.length > 0 && <div className={styles.evidenceGroup}>
              <h4 className={styles.groupTitle}>Required to complete</h4>
              <ul className={styles.evidenceList}>{required.map(item => <li key={item.kind}>
                <span>{evidenceLabels[item.kind]}</span><span className={`${styles.status} ${item.complete ? styles.complete : styles.pending}`}>{item.label}</span>
              </li>)}</ul>
            </div>}
            {isAdmin && !documentResult.error && missing.length === 0 && (
              <details className={`${styles.editor} ${styles.finishForm}`}>
                <summary className={styles.disclosure}>
                  <CircleCheck className={controls.icon} aria-hidden="true" />
                  <span>Complete this cycle</span>
                  <ChevronDown className={styles.disclosureChevron} aria-hidden="true" />
                </summary>
                <form action={completeComplianceCycle} className={styles.recordForm}>
                  <input type="hidden" name="recordId" value={record.id} />
                  <input type="hidden" name="cycleId" value={current.id} />
                  {current.performed_on
                    ? <input type="hidden" name="performedOn" value={current.performed_on} />
                    : <label className={controls.label}>{workLabel(record.record_type)}<input className={controls.input} name="performedOn" type="date" required /></label>}
                  <label className={controls.label}>Next due date<input className={controls.input} name="nextDueDate" type="date" /></label>
                  {record.record_type !== "servicing" && <label className={controls.label}>Next effective date<input className={controls.input} name="nextEffectiveDate" type="date" /></label>}
                  <input type="hidden" name="notes" value={current.notes ?? ""} />
                  <div className={`${styles.actions} ${styles.fullSpan}`}><SubmitButton className={`${controls.button} ${controls.primary}`} pendingText="Completing…"><CircleCheck className={controls.icon} aria-hidden="true" /> Complete</SubmitButton></div>
                </form>
              </details>
            )}
          </section>
        ) : <section className="panel">
          <h3 className={styles.groupTitle}>No open cycle</h3>
          {selectedArchive && <p className="subtle">Open a new cycle in record details before linking this PDF.</p>}
          {record.last_completed_date && <p className="subtle">Last completed {dateLabel(record.last_completed_date)}.</p>}
        </section>}
        <section className="panel" aria-labelledby="compliance-history-title" id="cycle-history">
          <h3 id="compliance-history-title" className={styles.groupTitle}>Cycle history</h3>
          {history.length ? <ul className={styles.historyList}>{history.map(cycle => (
            <li key={cycle.id}>
              <details id={`cycle-${cycle.id}`} open={query.focusCycle === cycle.id}>
                <summary className={styles.disclosure}>
                  <History className={controls.icon} aria-hidden="true" />
                  <span>Due {dateLabel(cycle.due_date)} · Completed {dateLabel(cycle.performed_on)}</span>
                  <ChevronDown className={styles.disclosureChevron} aria-hidden="true" />
                </summary>
                <div className={styles.historyContent}>
                  <CycleDates cycle={cycle} />
                  {cycle.notes && <p className="subtle">{cycle.notes}</p>}
                  {Boolean(cycle.required_evidence?.length) && <p className="subtle">Required for this cycle · {cycle.required_evidence?.map(kind => evidenceLabels[kind]).join(", ")}</p>}
                  {!documentResult.error && <DocumentList recordId={record.id} cycle={cycle} documents={documentsByCycle.get(cycle.id) ?? []} archive={archive} deliveries={deliveries} adminId={isAdmin ? profile.id : null} />}
                </div>
              </details>
            </li>
          ))}</ul> : <p className="subtle">No completed cycles recorded.</p>}
        </section>
        <section className="panel" aria-labelledby="compliance-details-title">
          <h3 id="compliance-details-title" className={styles.groupTitle}>Record details</h3>
          <dl className={styles.dateGrid}>
            <div><dt>Contact</dt><dd>{record.contact_name || "—"}</dd></div>
            <div><dt>Phone</dt><dd>{record.contact_phone || "—"}</dd></div>
            <div><dt>Email</dt><dd>{record.contact_email || "—"}</dd></div>
            <div><dt>Frequency</dt><dd>{record.frequency || "—"}</dd></div>
          </dl>
          {record.notes && <p className="subtle">{record.notes}</p>}
          {isAdmin && <details className={`${styles.editor} ${styles.finishForm}`}>
            <summary className={styles.disclosure}>
              <Pencil className={controls.icon} aria-hidden="true" />
              <span>Edit details</span>
              <ChevronDown className={styles.disclosureChevron} aria-hidden="true" />
            </summary>
            <ComplianceRecordForm section={section} record={record} effectiveDate={current?.effective_date} suppliers={suppliers} />
          </details>}
        </section>
      </div>
    </AppShell>
  );
}
