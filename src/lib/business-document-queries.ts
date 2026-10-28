import {createClient} from '@/lib/supabase/server';
import {isActiveDocument,purchaseOrderDocument,quotationDocument,type BusinessKind} from './business-documents';
import type {PurchaseOrder} from './purchase-orders/schema';
import type {Registry} from './quotations/model';
export async function loadBusinessDocuments(kind:BusinessKind){
 const db=await createClient();
 if(kind==='quotations'){
  const result=await db.from('quotation_registry').select('value').eq('id',1).maybeSingle();
  if(result.error)throw Error('Unable to load saved quotations.');
  const registry=result.data?.value as Registry|undefined;
  return (registry?.quotes||[]).filter(isActiveDocument).map(quotationDocument);
 }
 const orders:PurchaseOrder[]=[];
 for(let from=0;;from+=1000){
  const result=await db.from('inventory_purchase_orders').select('*').order('order_date',{ascending:false}).order('id').range(from,from+999);
  if(result.error)throw Error('Unable to load saved purchase orders.');
  orders.push(...result.data as PurchaseOrder[]);
  if(result.data.length<1000)break;
 }
 return orders.filter(isActiveDocument).map(purchaseOrderDocument);
}
