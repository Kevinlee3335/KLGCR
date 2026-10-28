// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({profile:vi.fn(),client:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSessionProfile:mocks.profile}));
vi.mock('@/lib/supabase/server',()=>({createClient:mocks.client}));
import {GET} from './route';
import {initialRegistry} from '@/lib/quotations/model';
beforeEach(()=>{vi.resetAllMocks();});
it('rejects staff before reading private quotation data',async()=>{
 mocks.profile.mockResolvedValue({role:'cleaner'});
 expect((await GET(new Request('https://example.test'),{params:Promise.resolve({id:'test'})})).status).toBe(403);
 expect(mocks.client).not.toHaveBeenCalled();
});
it('reviews only the selected saved quotation using private, uncached HTML',async()=>{
 const quote={...initialRegistry().quotes[0],id:'test',number:'2610-0099',customer:'Customer <test>'};
 mocks.profile.mockResolvedValue({role:'admin'});
 mocks.client.mockResolvedValue({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{value:{quotes:[quote]}},error:null})})})})});
 const result=await GET(new Request('https://example.test'),{params:Promise.resolve({id:'test'})});
 expect(result.status).toBe(200);
 expect(result.headers.get('cache-control')).toBe('private, no-store');
 expect(result.headers.get('content-type')).toContain('text/html');
 const html=await result.text();expect(html).toContain('2610-0099');expect(html).toContain('Customer &lt;test&gt;');
 expect((await GET(new Request('https://example.test'),{params:Promise.resolve({id:'missing'})})).status).toBe(404);
});
