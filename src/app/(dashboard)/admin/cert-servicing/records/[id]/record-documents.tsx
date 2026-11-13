import { canReviewDocumentStage } from "@/lib/document-review-status";
import Link from "next/link";
import { ArrowUpRight, Check, ChevronDown, FileText, FolderOpen, Link2, Mail, RotateCw, Search, Upload } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import controls from "@/components/compliance-controls.module.css";
import documentStyles from "@/components/compliance-documents.module.css";
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
        const canReview = canReviewDocumentStage(document.review_stage, reviewerStage);
        const canRetry = reviewerStage === "james" && delivery && ["pending", "failed", "blocked", "uncertain"].includes(delivery.status);
        const timeline = [
          document.fikri_verified_at && `Fikri verified ${timestampLabel(document.fikri_verified_at)}`,
          document.kevin_verified_at && `Kevin verified ${timestampLabel(document.kevin_verified_at)}`,
          document.james_approved_at && `James approved ${timestampLabel(document.james_approved_at)}`,
        ].filter(Boolean);
        return (
          <li key={document.id} className={documentStyles.documentRow} id={`document-${document.id}`}>
            <div className={documentStyles.documentInfo}>
              <strong className={styles.documentTitle}>{evidenceLabels[document.kind]} · {document.file_name}</strong>
              <div className={`${styles.sourceText} ${documentStyles.documentSource}`}>
                {document.source === "supplier_email" ? <Mail className={controls.icon} aria-hidden="true" /> : <Upload className={controls.icon} aria-hidden="true" />}
                {" "}{document.source === "supplier_email" ? "Supplier email" : "Admin upload"} · {timestampLabel(document.created_at)}
                {emailPath && <> · <Link className={documentStyles.inlineLink} href={emailPath}>Source email</Link></>}
              </div>
              {timeline.length > 0 && <small className={styles.documentDates}>{timeline.join(" · ")}</small>}
              {delivery && <small className={styles.documentDates}>
                Approval email {delivery.status === "sent" ? `sent ${delivery.sent_at ? timestampLabel(delivery.sent_at) : ""}` : delivery.status}
                {delivery.recipient && ` · ${delivery.recipient}`}
                {delivery.error && ` · ${delivery.error}`}
              </small>}
            </div>
            <div className={documentStyles.documentActions}>
              <span className={`${styles.status} ${completionStage(document) ? styles.complete : styles.pending}`}>{reviewLabels[document.review_stage]}</span>
              <a className={`${controls.button} ${controls.secondary} ${controls.small}`} href={`/api/compliance-documents/${document.id}`} target="_blank" rel="noopener noreferrer">
                <FileText className={controls.icon} aria-hidden="true" /> View PDF
              </a>
              {canReview && <form action={reviewComplianceDocument}>
                <input type="hidden" name="recordId" value={recordId} />
                <input type="hidden" name="cycleId" value={cycle.id} />
                <input type="hidden" name="documentId" value={document.id} />
                <input type="hidden" name="expectedStage" value={reviewerStage} />
                <SubmitButton className={`${controls.button} ${controls.primary} ${controls.small}`} pendingText="Saving…">
                  <Check className={controls.icon} aria-hidden="true" /> {reviewerStage === "james" ? "Approve" : "Verify"}
                </SubmitButton>
              </form>}
              {canRetry && <form action={retryComplianceDelivery}>
                <input type="hidden" name="recordId" value={recordId} />
                <input type="hidden" name="documentId" value={document.id} />
                <SubmitButton className={`${controls.button} ${controls.secondary} ${controls.small}`} pendingText="Checking…">
                  <RotateCw className={controls.icon} aria-hidden="true" /> Check or retry email
                </SubmitButton>
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
    <details className={documentStyles.archivePicker} id="supplier-email-pdf" open={Boolean(selectedArchive || activeSearch)}>
      <summary className={documentStyles.archiveSummary}>
        <Mail className={controls.icon} aria-hidden="true" />
        Link PDF from supplier email
        <ChevronDown className={documentStyles.archiveChevron} aria-hidden="true" />
      </summary>
      <div className={documentStyles.archiveBody}>
        <form action={recordPath(record.id) + "#supplier-email-pdf"} className={documentStyles.archiveSearch} method="get">
          <label className={documentStyles.archiveSearchField}>
            <span className={styles.srOnly}>Find a PDF by file name</span>
            <Search className={controls.icon} aria-hidden="true" />
            <input className={controls.input} name="archiveQ" type="search" defaultValue={searchTerm} maxLength={120} placeholder="Find PDF by file name…" required={!record.supplier_key} />
          </label>
          {record.supplier_key && <label className={documentStyles.archiveScope}><input type="checkbox" name="allSuppliers" value="1" defaultChecked={allSuppliers} /> All suppliers</label>}
          <button type="submit" className={`${controls.button} ${controls.secondary}`}>Search PDFs</button>
          <Link href="/documents/suppliers" className={`${controls.button} ${controls.quiet}`}>
            <FolderOpen className={controls.icon} aria-hidden="true" /> Supplier library
          </Link>
        </form>
        {loadError ? <p className="error" role="alert">Unable to search the supplier archive. Please try again.</p> : candidates.length ? (
          <form action={linkComplianceDocument}>
            <input type="hidden" name="recordId" value={record.id} />
            <input type="hidden" name="cycleId" value={cycle.id} />
            {sourceMessageId && selected && <input type="hidden" name="sourceMessageId" value={sourceMessageId} />}
            <fieldset className={documentStyles.archiveChoices}>
              <legend className={styles.groupTitle}>Choose PDF</legend>
              {candidates.map(item => {
                const emailPath = archiveEmailPath(item);
                const titleId = `archive-title-${item.id}`;
                const sourceId = `archive-source-${item.id}`;
                return <div key={item.id} className={documentStyles.archiveOption}>
                  <label className={documentStyles.archiveOptionLabel}>
                    <input type="radio" name="supplierDocumentId" value={item.id} required defaultChecked={item.id === initialChoice?.id} aria-labelledby={titleId} aria-describedby={sourceId} />
                    <span>
                      <strong id={titleId}>{item.file_name}</strong>
                      <small id={sourceId} className={styles.sourceText}>
                        {supplierNames.get(item.company) ?? item.company} · {item.folder} · {timestampLabel(item.email?.received_at ?? item.created_at)}
                        {item.email?.subject && ` · ${item.email.subject}`}
                      </small>
                    </span>
                  </label>
                  {emailPath && <Link className={`${controls.button} ${controls.quiet} ${controls.small} ${documentStyles.archiveSourceLink}`} href={emailPath} target="_blank" rel="noopener noreferrer">
                    Source email <ArrowUpRight className={controls.icon} aria-hidden="true" />
                  </Link>}
                </div>;
              })}
            </fieldset>
            <div className={documentStyles.archiveActions}>
              <label className={controls.label}>File as
                <select className={controls.select} name="kind" required defaultValue={defaultKind}>
                  <option value="" disabled>Select document type</option>
                  {evidenceKinds.map(kind => <option key={kind} value={kind}>{evidenceLabels[kind]}</option>)}
                </select>
              </label>
              <SubmitButton className={`${controls.button} ${controls.primary}`} pendingText="Linking…">
                <Link2 className={controls.icon} aria-hidden="true" /> Link to this cycle
              </SubmitButton>
            </div>
          </form>
        ) : (
          <p className="subtle">{selectedArchive || activeSearch || record.supplier_key ? "No matching unlinked PDFs found." : "Search by file name or select the supplier in the record details."}</p>
        )}
      </div>
    </details>
  );
}
