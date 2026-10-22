import { z } from 'zod';
import type { PurchaseOrder } from './schema';
export type ReceiptLine={itemId:string;code:string;description:string;quantity:number};
export type GoodsReceipt={id:string;order_id:string;items:ReceiptLine[];received_by:string;received_at:string;note:string;sheet_status:'pending'|'synced'|'failed';sheet_error:string|null};
export const receiveGoodsSchema=z.object({action:z.literal('receive'),orderId:z.string().uuid(),requestId:z.string().uuid(),expectedRevision:z.number().int().positive(),note:z.string().trim().max(500),items:z.array(z.object({itemId:z.string().uuid(),quantity:z.number().positive().max(1000000).refine(q=>Math.abs(q*100-Math.round(q*100))<0.000001)})).min(1).max(100)});
export function receivingLines(order:PurchaseOrder){
 const grouped=new Map<string,{itemId:string;code:string;description:string;unit:string;ordered:number;received:number;remaining:number}>();
 for(const item of order.items){const previous=grouped.get(item.itemId);const ordered=(previous?.ordered||0)+Number(item.quantity);const received=Number(order.received_quantities?.[item.itemId]||0);grouped.set(item.itemId,{itemId:item.itemId,code:item.code,description:item.description,unit:item.unit,ordered,received,remaining:Math.max(0,Number((ordered-received).toFixed(2)))});}
 return [...grouped.values()];
}
