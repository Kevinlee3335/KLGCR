import { documentReviewerForStage } from '@/lib/document-review-status';

export const complianceRecordTypes = ['certificate_license', 'servicing', 'agreement'] as const;
export const complianceDocumentKinds = ['quotation', 'invoice', 'service_report', 'certificate', 'agreement'] as const;
export const complianceDocumentBucket = 'compliance-documents';
export const compliancePdfLimit = 25_000_000;
export const compliancePath = '/admin/cert-servicing';

export type ComplianceRecordType = typeof complianceRecordTypes[number];
export type ComplianceDocumentKind = typeof complianceDocumentKinds[number];

export const complianceListPaths: Record<ComplianceRecordType, string> = {
  certificate_license: compliancePath + '/certificates',
  servicing: compliancePath + '/servicing',
  agreement: compliancePath + '/agreements',
};

export const complianceDocumentLabels: Record<ComplianceDocumentKind, string> = {
  quotation: 'Quotation',
  invoice: 'Invoice',
  service_report: 'Service Report',
  certificate: 'Certificate / licence',
  agreement: 'Signed agreement',
};

export const complianceReviewers = documentReviewerForStage;

export function complianceRecordPath(recordId: string) {
  return compliancePath + '/records/' + recordId;
}

export function complianceUploadPath(cycleId: string, sha256: string) {
  return cycleId + '/' + sha256 + '.pdf';
}
