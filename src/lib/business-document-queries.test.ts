// @vitest-environment node
import {expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({client:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:mocks.client}));
import {loadBusinessDocuments} from './business-document-queries';
import {initialRegistry} from './quotations/model';
it('reads live saved quotations without requiring a second upload or creating seed records',async()=>{
 let quotes=initialRegistry().quotes;
 mocks.client.mockResolvedValue({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{value:{quotes}},error:null})})})})});
 expect(await loadBusinessDocuments('quotations')).toHaveLength(1);
 quotes=[...quotes,{...quotes[0],id:'newly-saved',number:'2610-0002'}];
 expect((await loadBusinessDocuments('quotations')).map(d=>d.number)).toEqual(['2610-0001','2610-0002']);
});
it('leaves an empty quotation registry empty',async()=>{
 mocks.client.mockResolvedValue({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})})});
 expect(await loadBusinessDocuments('quotations')).toEqual([]);
});
