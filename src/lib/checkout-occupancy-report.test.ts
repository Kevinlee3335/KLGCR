import {describe,it,expect} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {reportDate,reportBounds,malaysiaDate,occupancyRoom,type OccupancyRow} from './checkout-occupancy-report';
import {occupancyPdf} from './checkout-occupancy-pdf';
describe('occupancy daily report',()=>{
 it('uses Malaysia calendar boundaries across UTC midnight',()=>{expect(reportBounds('2026-10-23')).toEqual({start:'2026-10-22T16:00:00.000Z',end:'2026-10-23T16:00:00.000Z'});expect(malaysiaDate(new Date('2026-10-22T16:01:00Z'))).toBe('2026-10-23');expect(reportDate('2026-02-30')).toBeNull();});
 it('includes a block prefix exactly once',()=>{expect(occupancyRoom({room_no:'A-421',block:{code:'A'}} as OccupancyRow)).toBe('A421');expect(occupancyRoom({room_no:'421',block:{code:'B'}} as OccupancyRow)).toBe('B421');});
 it('paginates the PDF and supports an empty daily report',async()=>{const rows=Array.from({length:40},(_,i)=>({id:String(i),room_no:`A${i+101}`,ready_at:'2026-10-23T02:00:00Z',occupancy_pax:2,block:{code:'A'}}));expect((await PDFDocument.load(await occupancyPdf('2026-10-23',rows))).getPageCount()).toBe(3);expect((await PDFDocument.load(await occupancyPdf('2026-10-23',[]))).getPageCount()).toBe(1);});
});
