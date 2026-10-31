import type { Signature } from './signature';
import { z } from 'zod';
const short = z.string().trim().max(200);
export const purchaseOrderSchema = z.object({
  useSignature:z.boolean().default(false),
  orderId: z.string().uuid().optional(), expectedRevision: z.number().int().positive().optional(),
  requestId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v),
  requestedBy: short.min(1), approvedBy: short,
  requestedDate: z.string().max(10), approvedDate: z.string().max(10),
  items: z.array(z.object({ itemId: z.string().uuid(), specification: short, quantity: z.number().positive().max(1000000), location: short })).min(1).max(100),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;
export type OrderLine = { balanceQty?:number|null; itemId: string; code: string; description: string; unit: string; specification: string; quantity: number; location: string };
export type PurchaseOrder = { requested_at?:string; created_by?: string; requested_signature?:Signature|null; approved_signature?:Signature|null; requested_signed_by?:string|null; requested_signed_at?:string|null; id: string; po_no: string; order_date: string; requested_by: string; approved_by: string; requested_date: string; approved_date: string; items: OrderLine[]; created_at: string; received_quantities?: Record<string,number>; revision?: number; approved_at?: string | null; approved_by_user?: string | null; updated_at?: string };
