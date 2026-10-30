import { expect, it } from 'vitest';
import { procurementRows, type ProcurementItem } from './inventory-procurement';
const item = (id:string, balance:number, extra:Partial<ProcurementItem>={}):ProcurementItem => ({id,item_code:id,description:id,category:'Painting',balance_qty:balance,reorder_level:2,unit:'drum',is_active:true,stock_group:'White Paint',procurement_mode:'maintain_stock',...extra});
it('uses all brand balances once; meeting a shared minimum needs no order',()=>{
  const [row]=procurementRows([item('a',0),item('b',2)]);
  expect(row.balance_qty).toBe(2); expect(row.reorder_level).toBe(2); expect(row.needsOrder).toBe(false); expect(row.itemIds).toEqual(['a','b']);
});
it('restores an entire zero-stock group after buy-when-needed is removed',()=>{
  const members=[item('a',0),item('b',0)];
  expect(procurementRows(members)[0].needsOrder).toBe(true);
  const hidden=procurementRows(members.map(i=>({...i,procurement_mode:'buy_when_needed'})))[0];
  expect(hidden.buyWhenNeeded).toBe(true); expect(hidden.needsOrder).toBe(false);
  expect(procurementRows(members)[0].needsOrder).toBe(true);
});
it('excludes inactive stock and never assumes an unverified group is available',()=>{
  const [row]=procurementRows([item('a',0),item('b',20,{is_active:false}),item('c',0,{quantity_unverified:true})]);
  expect(row.balance_qty).toBe(0); expect(row.unverified).toBe(true); expect(row.needsOrder).toBe(false);
});
it('keeps unrelated materials and existing individual reorder behavior separate',()=>{
  const rows=procurementRows([item('a',2,{stock_group:null}),item('b',0,{stock_group:null,procurement_mode:'buy_when_needed'})]);
  expect(rows).toHaveLength(2); expect(rows[0].needsOrder).toBe(true); expect(rows[1].needsOrder).toBe(false);
});
