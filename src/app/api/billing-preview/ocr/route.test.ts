// @vitest-environment node
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({profile:vi.fn(),rpc:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSessionProfile:mocks.profile}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:mocks.rpc})}));
import {POST} from './route';
beforeEach(()=>{
 vi.stubEnv('BILLING_DISABLED','false');vi.stubEnv('GEMINI_API_KEY','test-key');
 vi.stubGlobal('fetch',mocks.fetch);mocks.fetch.mockReset();mocks.rpc.mockReset();
 mocks.profile.mockResolvedValue({id:'admin',role:'admin'});
 mocks.rpc.mockImplementation(async(name:string)=>({error:null,data:name==='klgcr_ai_reserve'?{id:'usage-request'}:null}));
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()});
function request(meterId='utm-pe46'){
 return new NextRequest('https://example.test/api/billing-preview/ocr',{method:'POST',headers:{origin:'https://example.test'},body:JSON.stringify({photo:'data:image/jpeg;base64,YQ==',unit:'kWh',serial:'',readingDigits:null,meterId})});
}
function model(value:unknown){mocks.fetch.mockResolvedValue(new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:10,totalTokenCount:20}}),{status:200}))}
it('reads the PE46 energy display and converts 2.0281 GWh to 2028100 kWh once',async()=>{
 model({integerDigits:'20281',decimalDigits:null,displayValue:'2.0281',displayUnit:'GWh',confidence:'high',note:''});
 const response=await POST(request());expect(response.status).toBe(200);expect((await response.json()).reading).toBe(2028100);
 const payload=JSON.parse(mocks.fetch.mock.calls[0][1].body);expect(payload.contents[0].parts[0].text).toContain('cumulative delivered energy');
 expect(mocks.rpc).toHaveBeenLastCalledWith('klgcr_ai_finish',expect.objectContaining({p_state:'completed',p_total:20}));
});
it('does not add another 00 to a response already expressed in kWh',async()=>{
 model({integerDigits:'2028100',decimalDigits:null,displayValue:'2028100',displayUnit:'kWh',confidence:'high',note:''});
 expect((await(await POST(request())).json()).reading).toBe(2028100);
});
it('leaves other meters on the existing whole-digit rule',async()=>{
 model({integerDigits:'44348',decimalDigits:'9',confidence:'high',note:''});
 expect((await(await POST(request('bungalow-l2-e1'))).json()).reading).toBe(44348);
});
it('returns pending when PE46 unit information is missing rather than guessing a scale',async()=>{
 model({integerDigits:'20281',decimalDigits:null,confidence:'high',note:''});
 expect((await(await POST(request())).json()).reading).toBeNull();
});
it('keeps authorization and accounting limits',async()=>{
 mocks.profile.mockResolvedValue({id:'staff',role:'maintenance_staff'});expect((await POST(request())).status).toBe(403);expect(mocks.fetch).not.toHaveBeenCalled();
 mocks.profile.mockResolvedValue({id:'admin',role:'admin'});mocks.rpc.mockResolvedValue({data:null,error:{message:'Budget reached'}});expect((await POST(request())).status).toBe(429);expect(mocks.fetch).not.toHaveBeenCalled();
});
