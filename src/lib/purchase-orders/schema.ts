import { z } from 'zod';
const short = z.string().trim().max(200);
export const purchaseOrderSchema = z.object({
  requestId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v),
  requestedBy: short.min(1), approvedBy: short,
  requestedDate: z.string().max(10), approvedDate: z.string().max(10),
  items: z.array(z.object({ itemId: z.string().uuid(), specification: short, quantity: z.number().positive().max(1000000), location: short })).min(1).max(100),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;
export type OrderLine = { itemId: string; code: string; description: string; unit: string; specification: string; quantity: number; location: string };
export type PurchaseOrder = { id: string; po_no: string; order_date: string; requested_by: string; approved_by: string; requested_date: string; approved_date: string; items: OrderLine[]; created_at: string };
