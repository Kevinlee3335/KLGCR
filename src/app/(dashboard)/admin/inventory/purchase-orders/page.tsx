import { AppShell } from '@/components/app-shell';
import { PurchaseOrders } from '@/components/purchase-orders';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { GoodsReceipt } from '@/lib/purchase-orders/receipts';
import type { PurchaseOrder } from '@/lib/purchase-orders/schema';
export default async function Page({searchParams}:{searchParams:Promise<{po?:string}>}){
 const selectedPO=(await searchParams).po;
 const profile=await requireRole(['admin','management_viewer']);const db=await createClient();
 // Fetch in batches so the Supabase 1,000-row limit does not hide items or old POs.
 const items=[];const orders=[];const receipts=[];let error='';
 for(let from=0;;from+=1000){const r=await db.from('inventory_items').select('id,item_code,description,unit').eq('is_active',true).order('id').range(from,from+999);if(r.error){error='Unable to load inventory items.';break;}items.push(...r.data);if(r.data.length<1000)break;}
 for(let from=0;;from+=1000){const r=await db.from('inventory_purchase_orders').select('id,po_no,order_date,requested_by,approved_by,requested_date,approved_date,items,created_at,revision,updated_at,received_quantities,approved_at,approved_by_user,created_by').order('created_at',{ascending:false}).order('id').range(from,from+999);if(r.error){error='Purchase Order storage is unavailable. Please try again shortly.';break;}orders.push(...r.data);if(r.data.length<1000)break;}
 for(let from=0;;from+=1000){const r=await db.from('inventory_po_receipts').select('*').order('received_at',{ascending:false}).order('id').range(from,from+999);if(r.error){error='Unable to load receiving records.';break;}receipts.push(...r.data);if(r.data.length<1000)break;}
 const dispatch=await db.from('inventory_po_dispatch').select('order_id,revision,status,inventory_group');
 return <AppShell profile={profile} title="Purchase Orders"><div className="section-head"><div><p className="eyebrow">Inventory</p><h2>Purchase Orders</h2></div><a className="button secondary-button" href="/admin/inventory">Back to Inventory</a></div>{error?<p className="error">{error}</p>:<PurchaseOrders viewerId={profile.id} dispatches={dispatch.data||[]} initialSearch={orders.find(o=>o.id===selectedPO)?.po_no||''} items={items} orders={orders as PurchaseOrder[]} receipts={receipts as GoodsReceipt[]} requester={profile.full_name} canCreate={profile.role==='admin'} canApprove={['eeab5f04-30c3-42bd-a095-58e56c814358','1767d3e4-c907-45fe-8ed0-e433c0d0dca7'].includes(profile.id)&&profile.role==='admin'}/>}</AppShell>;
}
