import type { PurchaseOrder } from './purchase-orders/schema';
import type { Quotation } from './quotations/model';
export type BusinessKind='purchase-orders'|'quotations';
export type BusinessLine={description:string;code:string;specification:string;quantity:number;unit:string;price:number|null};
export type BusinessDocument={id:string;number:string;date:string;createdAt:string;party:string;status:string;items:BusinessLine[];reviewUrl:string};
export function isActiveDocument(input:object) {
 const value=input as {status?:string;deleted_at?:string|null;deletedAt?:string|null;cancelled_at?:string|null;cancelledAt?:string|null};
 return !value.deleted_at&&!value.deletedAt&&!value.cancelled_at&&!value.cancelledAt&&!['cancelled','canceled','void','deleted'].includes((value.status||'').toLowerCase());
}
export function searchTerms(query:string){return query.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];}
function contains(text:string,terms:string[]){return terms.every(t=>text.toLowerCase().includes(t));}
export function lineMatches(item:BusinessLine,query:string){return contains(item.description+' '+item.code+' '+item.specification,searchTerms(query));}
export function documentMatches(doc:BusinessDocument,query:string){
 const terms=searchTerms(query);
 return !terms.length||contains(doc.number+' '+doc.party,terms)||doc.items.some(i=>lineMatches(i,query));
}
export function newestDocuments<T extends {date:string;createdAt:string;id:string}>(docs:T[]){
 return [...docs].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
}
export function purchaseOrderDocument(order:PurchaseOrder):BusinessDocument {
 return {id:order.id,number:order.po_no,date:order.order_date,createdAt:order.created_at,party:order.requested_by,
 status:order.approved_at?'Approved':'Pending approval',
 items:order.items.map(i=>({...i,price:null})),reviewUrl:`/api/purchase-orders/${encodeURIComponent(order.id)}/pdf?view=1`};
}
export function quotationDocument(quote:Quotation):BusinessDocument {
 return {id:quote.id,number:quote.number,date:quote.date,createdAt:quote.createdAt,party:quote.customer,
 status:quote.approvedAt?'Approved':'Saved',
 items:quote.items.map(i=>({...i,code:'',specification:''})),reviewUrl:`/api/quotations/${encodeURIComponent(quote.id)}/review`};
}
export function recentPurchaseOrders(orders:PurchaseOrder[],query:string):PurchaseOrder[]{
 const active=orders.filter(isActiveDocument).filter(o=>documentMatches(purchaseOrderDocument(o),query));
 const sorted=newestDocuments(active.map(o=>({id:o.id,date:o.order_date,createdAt:o.created_at,order:o}))).map(x=>x.order);
 return query.trim()?sorted.slice(0,3):sorted;
}
