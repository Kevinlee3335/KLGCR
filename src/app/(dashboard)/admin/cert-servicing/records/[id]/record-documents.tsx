import Link from "next/link";
import { FileText, Mail, Upload } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { linkComplianceDocument, retryComplianceDelivery, reviewComplianceDocument } from "../../actions";
import {
  archiveEvidenceKind,
  completionStage,
  evidenceKinds,
  evidenceLabels,
  recordPath,
  reviewLabels,
  stageForReviewer,
  timestampLabel,
  type ArchiveChoice,
  type ComplianceCycle,
  type ComplianceDelivery,
  type ComplianceDocument,
  type ComplianceRecord,
  type SupplierChoice,
} from "../../record-model";
import styles from "../../compliance.module.css";

function archiveEmailPath(document: ArchiveChoice) {
  return document.email ? `/documents/suppliers/${document.company}/emails/${document.email.id}` : null;
}

export function DocumentList({
  recordId,
  cycle,
  documents,
  archive,
  deliveries,
  adminId,
}: {
  recordId: string;
  cycle: ComplianceCycle;
  documents: ComplianceDocument[];
  archive: Map<string, ArchiveChoice>;
  deliveries: Map<string, ComplianceDelivery>;
  adminId: string | null;
}) {
  if (!documents.length) return <p className="subtle">No PDFs filed for this cycle.</p>;
  const reviewerStage = adminId ? stageForReviewer(adminId) : undefined;
  return (
    <ul className={styles.documentList}>
      {documents.map(document => {
        const source = document.supplier_document_id ? archive.get(document.supplier_document_id) : undefined;
        const exactEmail = document.source_message_id
          ? source?.emails.find(email => email.id === document.source_message_id)
          : source?.email;
        const emailPath = source && exactEmail ? archiveEmailPath({ ...source, email: exactEmail }) : null;
        const delivery = deliveries.get(document.id);
        const canReview = reviewerStage && document.review_stage === reviewerStage;
        const canRetry = reviewerStage === "james" && delivery && ["pending", "failed", "blocked", "uncertain"].includes(delivery.status);
        const timeline = [
          document.fikri_verified_at && `Fikri verified ${timestampLabel(document.fikri_verified_at)}`,
          document.kevin_verified_at && `Kevin verified ${timestampLabel(document.kevin_verified_at)}`,
          document.james_approved_at && `James approved ${timestampLabel(document.james_approved_at)}`,
        ].filter(Boolean);
        return (
          <li key={document.id} className={styles.documentRow} id={`document-${document.id}`}>
            <div>
              <strong className={styles.documentTitle}>{evidenceLabels[document.kind]} · {document.file_name}</strong>
              <div className={styles.sourceText}>
                {document.source === "supplier_email" ? <Mail size={14} aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />}
                {" "}{document.source === "supplier_email" ? "Supplier email" : "Admin upload"} · {timestampLabel(document.created_at)}
                {emailPath && <> · <Link href={emailPath}>Source email</Link></>}
              </div>
              {timeline.length > 0 && <small className={styles.documentDates}>{timeline.join(" · ")}</small>}
              {delivery && <small className={styles.documentDates}>
                Approval email {delivery.status === "sent" ? `sent ${delivery.sent_at ? timestampLabel(delivery.sent_at) : ""}` : delivery.status}
                {delivery.recipient && ` · ${delivery.recipient}`}
                {delivery.error && ` · ${delivery.error}`}
              </small>}
            </div>
            <div className={styles.rowActions}>
              <span className={`${styles.status} ${completionStage(document) ? styles.complete : styles.pending}`}>{reviewLabels[document.review_stage]}</span>
              <a className="button secondary" href={`/api/compliance-documents/${document.id}`} target="_blank" rel="noopener noreferrer">
                <FileText size={14} aria-hidden="true" /> View PDF
              </a>
              {canReview && <form action={reviewComplianceDocument}>
                <input type="hidden" name="recordId" value={recordId} />
                <input type="hidden" name="cycleId" value={cycle.id} />
                <input type="hidden" name="documentId" value={document.id} />
                <input type="hidden" name="expectedStage" value={reviewerStage} />
                <SubmitButton pendingText="Saving…">{reviewerStage === "james" ? "Approve" : "Verify"}</SubmitButton>
              </form>}
              {canRetry && <form action={retryComplianceDelivery}>
                <input type="hidden" name="recordId" value={recordId} />
                <input type="hidden" name="documentId" value={document.id} />
                <SubmitButton className="button secondary" pendingText="Checking…">Check or retry email</SubmitButton>
              </form>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ArchivePicker({
  record,
  cycle,
  candidates,
  suppliers,
  selectedArchive,
  sourceMessageId,
  searchTerm,
  allSuppliers,
  loadError,
}: {
  record: ComplianceRecord;
  cycle: ComplianceCycle;
  candidates: ArchiveChoice[];
  suppliers: SupplierChoice[];
  selectedArchive?: string;
  sourceMessageId?: string;
  searchTerm: string;
  allSuppliers: boolean;
  loadError: boolean;
}) {
  const selected = candidates.find(item => item.id === selectedArchive);
  const supplierNames = new Map(suppliers.map(supplier => [supplier.id, supplier.name]));
  const initialChoice = selected ?? candidates[0];
  const defaultKind = candidates.length === 1 && initialChoice ? archiveEvidenceKind(initialChoice.folder, record.record_type) : "";
  const activeSearch = searchTerm || allSuppliers;
  return (
    <details className={styles.archivePicker} id="supplier-email-pdf" open={Boolean(selectedArchive || activeSearch)}>
      <summary>Link PDF from supplier email</summary>
      <form action={recordPath(record.id) + "#supplier-email-pdf"} className={styles.search} method="get">
        <label>
          <span className={styles.srOnly}>Find a PDF by file name</span>
          <input name="archiveQ" type="search" defaultValue={searchTerm} maxLength={120} placeholder="Find PDF by file name…" required={!record.supplier_key} />
        </label>
        {record.supplier_key && <label className={styles.archiveScope}><input type="checkbox" name="allSuppliers" value="1" defaultChecked={allSuppliers} /> All suppliers</label>}
        <button type="submit" className="button secondary">Search PDFs</button>
        <Link href="/documents/suppliers" className="button secondary">Supplier library</Link>
      </form>
      {loadError ? <p className="error" role="alert">Unable to search the supplier archive. Please try again.</p> : candidates.length ? (
        <form action={linkComplianceDocument}>
          <input type="hidden" name="recordId" value={record.id} />
          <input type="hidden" name="cycleId" value={cycle.id} />
          {sourceMessageId && selected && <input type="hidden" name="sourceMessageId" value={sourceMessageId} />}
          <fieldset className={styles.archiveChoices}>
            <legend className={styles.groupTitle}>Choose PDF</legend>
            {candidates.map(item => {
              const emailPath = archiveEmailPath(item);
              return <div key={item.id} className={styles.archiveOption}>
                <div>
                  <label>
                    <input type="radio" name="supplierDocumentId" value={item.id} required defaultChecked={item.id === initialChoice?.id} />
                    <strong>{item.file_name}</strong>
                  </label>
                  <small className={styles.sourceText}>
                    {supplierNames.get(item.company) ?? item.company} · {item.folder} · {timestampLabel(item.email?.received_at ?? item.created_at)}
                    {item.email?.subject && ` · ${item.email.subject}`}
                  </small>
                </div>
                {emailPath && <Link className="button secondary" href={emailPath} target="_blank" rel="noopener noreferrer">Source email</Link>}
              </div>;
            })}
          </fieldset>
          <div className={`${styles.actions} ${styles.archiveActions}`}>
            <label className="field">File as
              <select name="kind" required defaultValue={defaultKind}>
                <option value="" disabled>Select document type</option>
                {evidenceKinds.map(kind => <option key={kind} value={kind}>{evidenceLabels[kind]}</option>)}
              </select>
            </label>
            <SubmitButton pendingText="Linking…">Link to this cycle</SubmitButton>
          </div>
        </form>
      ) : (
        <p className="subtle">{selectedArchive || activeSearch || record.supplier_key ? "No matching unlinked PDFs found." : "Search by file name or select the supplier in the record details."}</p>
      )}
    </details>
  );
}
