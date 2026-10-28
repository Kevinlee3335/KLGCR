import type {BillingSnapshot} from './billing-preview';
import {signatureSchema,type Signature} from './purchase-orders/signature';
export const BILLING_APPROVER_ID='eeab5f04-30c3-42bd-a095-58e56c814358';
export type BillingApproval={run_id:string;approved_by_user:string;approved_by:string;approved_at:string;signature:Signature};
// The signature comes only from the approval record, never from a submitted invoice snapshot.
export function withBillingApproval(snapshot:BillingSnapshot,approval?:BillingApproval|null):BillingSnapshot{
 const unsigned={...snapshot};delete unsigned.approval;
 const parsed=signatureSchema.safeParse(approval?.signature);
 return approval?.approved_by_user===BILLING_APPROVER_ID&&parsed.success&&Number.isFinite(Date.parse(approval.approved_at))
  ?{...unsigned,approval:{...approval,signature:parsed.data}}:unsigned;
}
