// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {PDFDocument} from 'pdf-lib';
import {countOccupancyRooms,loadOccupancyReport,reportDate,reportBounds,malaysiaDate,occupancyRoom,type OccupancyRow} from './checkout-occupancy-report';
import {occupancyPdf} from './checkout-occupancy-pdf';
describe('occupancy daily report',()=>{
 it('uses Malaysia calendar boundaries across UTC midnight',()=>{expect(reportBounds('2026-10-23')).toEqual({start:'2026-10-22T16:00:00.000Z',end:'2026-10-23T16:00:00.000Z'});expect(malaysiaDate(new Date('2026-10-22T16:01:00Z'))).toBe('2026-10-23');expect(reportDate('2026-02-30')).toBeNull();});
 it('includes a block prefix exactly once',()=>{expect(occupancyRoom({room_no:'A-421',block:{code:'A'}} as OccupancyRow)).toBe('A421');expect(occupancyRoom({room_no:'421',block:{code:'B'}} as OccupancyRow)).toBe('B421');});
 it('paginates the PDF and supports an empty daily report',async()=>{const rows=Array.from({length:40},(_,i)=>({id:String(i),room_no:`A${i+101}`,ready_at:'2026-10-23T02:00:00Z',occupancy_pax:2,block:{code:'A'}}));expect((await PDFDocument.load(await occupancyPdf('2026-10-23',rows))).getPageCount()).toBe(3);expect((await PDFDocument.load(await occupancyPdf('2026-10-23',[]))).getPageCount()).toBe(1);});
});

describe('occupancy queries', () => {
 function testClient(fetch: typeof globalThis.fetch) {
  return createClient('https://database.example.test', 'test-key', {
   auth: {autoRefreshToken: false, persistSession: false},
   global: {fetch},
  });
 }

 it('shares the same Malaysia date and status filters between report rows and exact count', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_url, init) => {
   if (init?.method === 'HEAD') return new Response(null, {headers: {'content-range': '*/1234'}});
   return Response.json([]);
  });
  const db = testClient(fetch);
  await loadOccupancyReport(db, '2026-11-01', '2026-11-05');
  await expect(countOccupancyRooms(db, '2026-11-01', '2026-11-05')).resolves.toBe(1234);

  const [[listUrl], [countUrl, countRequest]] = fetch.mock.calls;
  const list = new URL(String(listUrl));
  const count = new URL(String(countUrl));
  expect(count.pathname).toBe(list.pathname);
  expect(countRequest?.method).toBe('HEAD');
  expect(new Headers(countRequest?.headers).get('prefer')).toContain('count=exact');
  expect(count.searchParams.get('select')).toBe('id');
  expect(count.searchParams.get('deleted_at')).toBe('is.null');
  expect(count.searchParams.get('status')).toBe('eq.ready_for_occupancy');
  expect(count.searchParams.has('limit')).toBe(false);
  expect(count.searchParams.has('order')).toBe(false);
  for (const filter of ['deleted_at', 'status', 'ready_at']) {
   expect(count.searchParams.getAll(filter)).toEqual(list.searchParams.getAll(filter));
  }
  expect(count.searchParams.getAll('ready_at')).toEqual([
   'gte.2026-10-31T16:00:00.000Z', 'lt.2026-11-05T16:00:00.000Z',
  ]);
 });

 it('distinguishes an empty count from a missing database count', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
   .mockResolvedValueOnce(new Response(null, {headers: {'content-range': '*/0'}}))
   .mockResolvedValueOnce(new Response(null));
  const db = testClient(fetch);
  await expect(countOccupancyRooms(db)).resolves.toBe(0);
  expect(new URL(String(fetch.mock.calls[0][0])).searchParams.has('ready_at')).toBe(false);
  await expect(countOccupancyRooms(db)).rejects.toThrow('Unable to load occupancy report');
 });

 it('rejects a reversed range before querying the database', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const db = testClient(fetch);
  await expect(loadOccupancyReport(db, '2026-11-05', '2026-11-01')).rejects.toThrow('Invalid report date range');
  await expect(countOccupancyRooms(db, '2026-11-05', '2026-11-01')).rejects.toThrow('Invalid report date range');
  expect(fetch).not.toHaveBeenCalled();
 });
});
