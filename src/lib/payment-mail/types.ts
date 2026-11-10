import type {BillingDocumentKind, BillingDocumentRecord} from '@/lib/billing-documents';
import type {OfficialReceipt} from '@/lib/official-receipt';

export const NOVEMBER_PAYMENT_MAIL_START = '2026-11-01';

export const paymentMailStatuses = [
  'pending_verification', 'needs_review', 'verified', 'rejected', 'duplicate', 'ignored',
] as const;
export type PaymentMailStatus = typeof paymentMailStatuses[number];
export type PaymentMailListStatus = PaymentMailStatus | 'pending' | 'all';

export type PaymentMailAttachment = {
  id: string;
  message_id: string;
  gmail_part_id: string;
  filename: string;
  mime_type: 'application/pdf' | 'image/jpeg' | 'image/png';
  size_bytes: number;
  content_hash: string;
  storage_path: string;
  status: 'pending' | 'ready' | 'failed' | 'ignored';
  extraction_text?: string;
  extraction_details?: Record<string, unknown>;
  created_at: string;
};

export type PaymentMailItem = {
  id: string;
  mailbox: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  sender_email: string;
  sender_name: string;
  subject: string;
  body_text: string;
  received_at: string;
  status: PaymentMailStatus;
  suggested_company_key: string | null;
  /** Derived from registered billing contacts; never inferred from the sender's display name. */
  suggested_company_name: string | null;
  suggested_amount: number | null;
  suggested_paid_on: string | null;
  suggested_reference: string;
  suggested_invoice_numbers: string[];
  review_reasons: string[];
  extraction_status: 'pending' | 'ready' | 'needs_review' | 'failed';
  extraction_details: Record<string, unknown>;
  attachment_count: number;
  ingestion_completed_at: string | null;
  duplicate_of: string | null;
  receipt_id: string | null;
  verified_by: string | null;
  verified_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  verification_details: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  attachments: PaymentMailAttachment[];
};

export type PaymentMailCompany = {
  /** An exact registered email is a candidate group, not proof that its accounts share a payer. */
  key: string;
  name: string;
  email: string;
  accounts: {kind: BillingDocumentKind; account_key: string; account_name: string}[];
};
export type PaymentMailInvoice = BillingDocumentRecord & {paid: number; balance: number; customer_package_id?: string};
export type PaymentMailListItem = Pick<PaymentMailItem, 'id' | 'sender_email' | 'subject' | 'received_at' | 'status'
  | 'suggested_company_key' | 'suggested_company_name' | 'suggested_amount' | 'suggested_reference' | 'review_reasons'>;
export type PaymentMailList = {items: PaymentMailListItem[]; total: number};
export type PaymentMailDetail = {
  item: PaymentMailItem;
  companies: PaymentMailCompany[];
  invoiceOptions: PaymentMailInvoice[];
  receipt: OfficialReceipt | null;
};
export type VerifyPaymentMailInput = {
  action: 'verify';
  id: string;
  companyKey: string;
  paidOn: string;
  bankReference: string;
  amount: number;
  bankReceived: true;
  companyConfirmed: true;
  proofId: string;
  allocations: {run_id: string; line_index: number; amount: number}[];
};
export type PaymentMailMutationResult = {
  ok: true;
  item: PaymentMailItem;
  receipt?: OfficialReceipt;
  mail?: 'sent' | 'pending';
};
