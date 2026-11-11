import {it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({db:vi.fn()}));vi.mock('./supabase/server',()=>({createClient:mocks.db}));
import {loadBillingDocumentRecords,loadBillingReviewEntries} from './billing-document-queries';
it('reads all saved months beyond the first 1000 records using metadata only',async()=>{
 const rows=Array.from({length:1001},(_,i)=>({run_id:String(i),line_index:0}));const pages:number[][]=[];const selections:string[]=[];mocks.db.mockResolvedValue({from:(table:string)=>{expect(table).toBe('billing_document_index');return {select(value:string){selections.push(value);return this},eq(){return this},order(){return this},range:async(a:number,b:number)=>{pages.push([a,b]);return {data:rows.slice(a,b+1),error:null}}}}});
 expect(await loadBillingDocumentRecords('rental','tenant')).toHaveLength(1001);expect(pages).toEqual([[0,999],[1000,1999]]);expect(selections[0]).not.toContain('snapshot');expect(selections[0]).not.toContain('photo');
});

it('loads only the selected invoice pack’s review columns in saved order', async () => {
 const data = [
  {line_index:0,bill_no:'UTIL-02',account_name:'First company',amount:13},
  {line_index:1,bill_no:'UTIL-01',account_name:'Second company',amount:20.5},
 ];
 const order = vi.fn().mockResolvedValue({data,error:null});
 const eq = vi.fn().mockReturnValue({order});
 const select = vi.fn().mockReturnValue({eq});
 const from = vi.fn().mockReturnValue({select});
 mocks.db.mockResolvedValue({from});

 expect(await loadBillingReviewEntries('selected-run')).toEqual(data);
 expect(from).toHaveBeenCalledWith('billing_document_index');
 expect(select).toHaveBeenCalledWith('line_index,bill_no,account_name,amount');
 expect(eq).toHaveBeenCalledWith('run_id','selected-run');
 expect(order).toHaveBeenCalledWith('line_index');
});
