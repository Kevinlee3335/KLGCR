import { documentReviewerStage } from "@/lib/document-review-status";
import { malaysiaDate } from "@/lib/monitoring-follow-up";
import {
  complianceDocumentKinds, complianceDocumentLabels, complianceListPaths, compliancePath, complianceRecordPath,
  type ComplianceDocumentKind,
} from "@/lib/compliance-workflow";

export const complianceBase = compliancePath;

export const sections = [
  { slug: "certificates", kind: "certificate_license", title: "Cert & License", singular: "certificate or licence" },
  { slug: "servicing", kind: "servicing", title: "Servicing", singular: "servicing item" },
  { slug: "agreements", kind: "agreement", title: "Agreement Renewal", singular: "agreement" },
] as const;

export type ComplianceSection = typeof sections[number];
export type ComplianceKind = ComplianceSection["kind"];

export const evidenceLabels = complianceDocumentLabels;
export type EvidenceKind = ComplianceDocumentKind;
export const evidenceKinds = complianceDocumentKinds;
export const requiredEvidenceKinds = evidenceKinds.filter(kind => kind !== "quotation");

export function sectionForRecord(kind: string) {
  return sections.find(section => section.kind === kind) ?? sections[0];
}

function archiveQuery(supplierDocumentId?: string, sourceMessageId?: string) {
  if (!supplierDocumentId) return "";
  const query = new URLSearchParams({ supplierDocumentId });
  if (sourceMessageId) query.set("sourceMessageId", sourceMessageId);
  return `?${query.toString()}`;
}

export function sectionPath(section: ComplianceSection, supplierDocumentId?: string, sourceMessageId?: string) {
  return complianceListPaths[section.kind] + archiveQuery(supplierDocumentId, sourceMessageId);
}

export function recordPath(id: string, supplierDocumentId?: string, sourceMessageId?: string) {
  return complianceRecordPath(id) + archiveQuery(supplierDocumentId, sourceMessageId);
}

export function isRecordUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function isSourceMessageId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{10,40}$/.test(value);
}

export function linkArchivePath(id: string, sourceMessageId?: string) {
  return sectionPath(sections[0], id, sourceMessageId);
}

export const recordFields =
  "id,record_type,title,provider,reference_no,last_completed_date,next_due_date,status,frequency,contact_name,contact_phone,contact_email,notes,location,supplier_key,required_evidence,template_row";

export type ComplianceRecord = {
  id: string;
  record_type: ComplianceKind;
  title: string;
  provider: string | null;
  reference_no: string | null;
  last_completed_date: string | null;
  next_due_date: string | null;
  status: string;
  frequency: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  location: string | null;
  supplier_key: string | null;
  required_evidence: EvidenceKind[];
  template_row: number | null;
};

export type ComplianceCycle = {
  id: string;
  record_id: string;
  due_date: string | null;
  original_due_date: string | null;
  effective_date: string | null;
  completed_at: string | null;
  performed_on: string | null;
  next_due_date: string | null;
  next_effective_date: string | null;
  requires_invoice: boolean;
  required_evidence: EvidenceKind[] | null;
  notes: string | null;
  status: "open" | "completed";
  created_at: string;
};

export const reviewLabels = {
  verification: "Awaiting Fikri and Kevin Verify",
  fikri: "Awaiting Fikri Verify",
  kevin: "Awaiting Kevin Verify",
  james: "Awaiting James Approve",
  approved: "Approved",
  verified: "Verified",
  filed: "Filed",
} as const;

export type ReviewStage = keyof typeof reviewLabels;
export const stageForReviewer = documentReviewerStage;

export type ComplianceDocument = {
  id: string;
  cycle_id: string;
  kind: EvidenceKind;
  file_name: string;
  source: "supplier_email" | "upload";
  created_at: string;
  review_stage: ReviewStage;
  fikri_verified_at: string | null;
  kevin_verified_at: string | null;
  james_approved_at: string | null;
  supplier_document_id: string | null;
  source_message_id: string | null;
};

export type ComplianceDelivery = {
  document_id: string;
  status: string;
  recipient: string | null;
  attempted_at: string | null;
  sent_at: string | null;
  error: string | null;
};

export const documentFields =
  "id,cycle_id,kind,file_name,source,created_at,review_stage,fikri_verified_at,kevin_verified_at,james_approved_at,supplier_document_id,source_message_id";

export type SupplierChoice = { id: string; name: string };
export type ArchiveEmail = { id: string; subject: string; received_at: string };
export type ArchiveChoice = {
  id: string;
  company: string;
  file_name: string;
  folder: string;
  created_at: string;
  email: ArchiveEmail | null;
  emails: ArchiveEmail[];
};

const malaysiaDateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  dateStyle: "medium",
  timeStyle: "short",
});

export function dateLabel(value: string | null | undefined, empty = "—") {
  return value ? value.slice(0, 10).split("-").reverse().join("/") : empty;
}

export function timestampLabel(value: string) {
  return malaysiaDateTime.format(new Date(value));
}

export function completionStage(document: ComplianceDocument) {
  if (document.kind === "quotation" || document.kind === "invoice") return document.review_stage === "approved";
  if (document.kind === "service_report") return document.review_stage === "verified";
  return document.review_stage === "filed";
}

export function dueStatus(dueDate: string | null, status: string) {
  if (status === "completed") return { label: "Completed", tone: "complete" } as const;
  if (!dueDate) return { label: "Date needed", tone: "pending" } as const;
  const today = malaysiaDate();
  if (dueDate < today || status === "expired") return { label: "Overdue", tone: "overdue" } as const;
  if (dueDate === today) return { label: "Due today", tone: "pending" } as const;
  if (status === "renewal_in_progress") return { label: "In progress", tone: "pending" } as const;
  return { label: "Active", tone: "neutral" } as const;
}

export function archiveEvidenceKind(folder: string, kind: ComplianceKind): EvidenceKind {
  if (folder === "Quotation") return "quotation";
  if (folder === "Invoice") return "invoice";
  if (folder === "Service Report") return "service_report";
  if (folder === "Agreement" || kind === "agreement") return "agreement";
  return kind === "servicing" ? "service_report" : "certificate";
}
