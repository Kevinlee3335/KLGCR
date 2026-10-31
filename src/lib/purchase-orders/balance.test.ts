// @vitest-environment node
import {expect,it} from 'vitest';
import {writeFileSync} from 'node:fs';
import {itemBalance,balanceLabel} from './balance';
import {purchaseOrderPdf} from './pdf';
it('uses combined brands, preserves zero and marks unverified quantities',()=>{
 const items=[{id:'a',balance_qty:0,stock_group:'Cement',inventory_group:'building'},{id:'b',balance_qty:2,stock_group:'Cement',inventory_group:'building'}];
 expect(itemBalance(items,'a')).toBe(2);expect(balanceLabel(0,'pcs')).toBe('Balance Qty: 0 pcs');
 expect(itemBalance([{...items[0],quantity_unverified:true}],'a')).toBeNull();
});
it('renders the PO balance sample',async()=>{
 const bytes=await purchaseOrderPdf({id:'sample',po_no:'SAMPLE - BALANCE QTY',order_date:'2026-10-31',requested_by:'KEVIN LEE',approved_by:'',requested_date:'2026-10-31',approved_date:'',created_at:'2026-10-31T03:00:00Z',items:[
 {itemId:'a',code:'SAMPLE-01',description:'ACRYLIC LATEX SEALANT (GAP FILLA)',unit:'pcs',balanceQty:2,quantity:10,specification:'',location:'BLK A-D'},
 {itemId:'b',code:'SAMPLE-02',description:'STANDARD CEMENT 50KG',unit:'bags',balanceQty:0,quantity:5,specification:'',location:'BLK A-D'}]});
 if(process.env.PO_BALANCE_SAMPLE)writeFileSync(process.env.PO_BALANCE_SAMPLE,bytes);
 expect(bytes.length).toBeGreaterThan(1000);
});
