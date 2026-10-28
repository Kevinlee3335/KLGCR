// @vitest-environment node
import {expect,it,vi} from 'vitest';
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn()}));
import {supplierMailDayWindow} from './queries';
it('switches dashboard mail days at Malaysia midnight, including year boundaries',()=>{
 expect(supplierMailDayWindow(new Date('2026-10-27T15:59:59Z'))).toEqual({start:'2026-10-26T16:00:00.000Z',end:'2026-10-27T16:00:00.000Z'});
 expect(supplierMailDayWindow(new Date('2026-10-27T16:00:00Z'))).toEqual({start:'2026-10-27T16:00:00.000Z',end:'2026-10-28T16:00:00.000Z'});
 expect(supplierMailDayWindow(new Date('2026-12-31T16:00:00Z'))).toEqual({start:'2026-12-31T16:00:00.000Z',end:'2027-01-01T16:00:00.000Z'});
});
