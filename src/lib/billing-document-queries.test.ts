import {it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({db:vi.fn()}));vi.mock('./supabase/server',()=>({createClient:mocks.db}));
import {loadBillingDocumentRecords} from './billing-document-queries';
it('reads all saved months beyond the first 1000 records using metadata only',async()=>{
 const rows=Array.from({length:1001},(_,i)=>({run_id:String(i),line_index:0}));const pages:number[][]=[];const selections:string[]=[];mocks.db.mockResolvedValue({from:(table:string)=>{expect(table).toBe('billing_document_index');return {select(value:string){selections.push(value);return this},eq(){return this},order(){return this},range:async(a:number,b:number)=>{pages.push([a,b]);return {data:rows.slice(a,b+1),error:null}}}}});
 expect(await loadBillingDocumentRecords('rental','tenant')).toHaveLength(1001);expect(pages).toEqual([[0,999],[1000,1999]]);expect(selections[0]).not.toContain('snapshot');expect(selections[0]).not.toContain('photo');
});
