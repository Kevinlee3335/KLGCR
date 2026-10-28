// @vitest-environment node
import {expect,it} from 'vitest';
import {recentPurchaseOrders,purchaseOrderDocument,quotationDocument,documentMatches} from './business-documents';
import type {PurchaseOrder} from './purchase-orders/schema';
import {initialRegistry} from './quotations/model';
function po(id:string,date:string):PurchaseOrder{
 return {id,po_no:'2026-'+id,order_date:date,requested_by:'Requester',approved_by:'',requested_date:date,approved_date:'',created_at:date+'T00:00:00Z',
 items:[{itemId:'item',code:'WM-01',description:'Window Handle (L)',specification:'White aluminium',quantity:2,unit:'PCS',location:'Block A'}]};
}
it('returns the latest three matching saved orders by order date and excludes cancellations',()=>{
 const cancelled={...po('5','2026-12-01'),status:'cancelled'};
 const orders=[po('1','2026-01-01'),po('4','2026-04-01'),cancelled,po('2','2026-02-01'),po('3','2026-03-01')];
 expect(recentPurchaseOrders(orders,'window handle').map(o=>o.id)).toEqual(['4','3','2']);
 expect(recentPurchaseOrders(orders,'').map(o=>o.id)).toEqual(['4','3','2','1']);
 expect(orders[0].id).toBe('1');
});
it('matches item names, codes and specifications without joining unrelated item rows',()=>{
 const doc=purchaseOrderDocument(po('1','2026-01-01'));
 expect(documentMatches(doc,'handle window')).toBe(true);
 expect(documentMatches(doc,'white handle')).toBe(true);
 expect(documentMatches(doc,'WM-01')).toBe(true);
 expect(documentMatches({...doc,items:[{...doc.items[0],description:'Window',specification:''},{...doc.items[0],description:'Door Handle',specification:''}]},'window handle')).toBe(false);
 expect(doc.reviewUrl).toBe('/api/purchase-orders/1/pdf?view=1');
 expect(doc.items[0].price).toBeNull();
});
it('keeps quotation prices and sends review to the exact saved quotation',()=>{
 const quote=initialRegistry().quotes[0],doc=quotationDocument(quote);
 expect(doc.items[0].price).toBe(quote.items[0].price);
 expect(doc.reviewUrl).toBe('/api/quotations/'+quote.id+'/review');
 expect(documentMatches(doc,'access card')).toBe(true);
});
