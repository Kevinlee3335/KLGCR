// @vitest-environment node
import {expect,it} from 'vitest';
import {parsePriceLines,recentPriceRecords,type PriceDocument} from './prices';
function doc(id:string,date:string,reference:string,price:number):PriceDocument {
 return {id,company:'mfe',folder:'Quotation',file_name:reference+'.pdf',receivedAt:'2026-10-01',content_text:
  `Our Ref. :${reference} Date : ${date}\n1. Replace 25mm Hose Reel Nozzle (for No.13) 2 Nos RM ${price.toFixed(2)} RM ${(price*2).toFixed(2)}\nTotal: RM 9999.00`};
}
it('reads unit price independently of grand totals, and validates the line arithmetic',()=>{
 expect(parsePriceLines(doc('a','01.02.2025','SQ1',72).content_text)[0]).toMatchObject({quantity:2,unitPrice:72,lineTotal:144});
 expect(parsePriceLines('1. Hose reel nozzle 2 NO 55.00 110.00 8% 8.80 118.80')[0]).toMatchObject({unitPrice:55,lineTotal:110});
 expect(parsePriceLines('1. Hose reel nozzle 2 NO 55.00 999.00')).toEqual([]);
 expect(parsePriceLines('Total RM 9999.00')).toEqual([]);
});
it('returns the latest three documents by document date, deduplicates revisions, and tolerates norzel',()=>{
 const records=recentPriceRecords([doc('1','01.01.2023','SQ1',70),doc('2','02.02.2024','SQ2',75),doc('3','03.03.2025','SQ3',80),doc('4','04.04.2026','SQ4',85),doc('5','05.04.2026','SQ4(R2)',86)],'norzel');
 expect(records.map(r=>r.id)).toEqual(['5','3','2']);
 expect(records[0].lines[0].unitPrice).toBe(86);
});
it('keeps reused references across years, filters description rather than neighbouring items, and excludes credit notes',()=>{
 const old=doc('a','01.01.2024','MS123',60),newer=doc('b','01.01.2025','MS123',65);
 expect(recentPriceRecords([old,newer],'hose reel nozzle')).toHaveLength(2);
 expect(recentPriceRecords([old],'pcb')).toEqual([]);
 expect(recentPriceRecords([{...old,content_text:'CREDIT NOTE\n'+old.content_text}],'nozzle')).toEqual([]);
});
