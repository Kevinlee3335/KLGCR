export const BILLING_MAIL_FROM='klgcr.noreply@gmail.com';
export const BILLING_MAIL_TO='account1@keanlenggroup.com';
export const BILLING_MAIL_CC=['klgcr.kevin@gmail.com','klgcr.fikri@gmail.com'] as const;
export const MANUALLY_SENT_CUSTOMER_INVOICE_PERIOD = '2026-11';
export const MANUALLY_SENT_CUSTOMER_INVOICE_MESSAGE = 'November 2026 customer invoices were already sent manually.';
export type BillingMailStatus='pending'|'sending'|'sent'|'blocked'|'failed'|'uncertain';
export type BillingMailState={run_id:string;status:BillingMailStatus;sent_at:string|null;error:string|null};
