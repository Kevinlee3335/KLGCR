// @vitest-environment node
import {afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({db:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:mocks.db}));
vi.mock('@/lib/membership-secrets',()=>({openToken:async()=> 'test-token'}));
vi.mock('@/lib/membership',()=>({appOrigin:()=> 'https://example.test',escapeHtml:(s:string)=>s,memberLink:()=> 'https://example.test/manage/test-token'}));
import {deliverMembershipEmails} from './membership-email';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks()});
it.each([[true,false],[false,false],[true,true],[false,true]])('marks Gym member email sent only after gateway confirmation: %s (PDF: %s)',async (accepted,withReceipt)=>{
 const writes:{table:string;value:Record<string,unknown>}[]=[];
 const replies=[
 {data:[{id:'mail',member_id:'member',kind:'approved',period_start:'2026-10-01',payment_id:'payment',attempts:0}]},
 {data:{id:'mail'}},
 {data:{id:'member',full_name:'Test Member',email:'member@example.test',status:'active',expires_on:'2026-10-31',token_ciphertext:'test'}},
 {data:{kind:'renewal',status:'approved'}},
 {data:withReceipt?{id:'receipt',receipt_no:'KLGCR/260001',paid_on:'2026-10-29',payer:'Test Member',amount:40,description:'Gym renewal - 2026-10',bank_reference:''}:null},{data:null},{data:[]}
 ];
 mocks.db.mockReturnValue({from(table:string){const q:Record<string,unknown>={};for(const name of ['select','eq','gt','order','limit'])q[name]=()=>q;q.update=(value:Record<string,unknown>)=>{writes.push({table,value});return q};const next=()=>Promise.resolve(replies.shift()||{data:[]});q.single=q.maybeSingle=next;q.then=(resolve:(v:unknown)=>unknown,reject:(v:unknown)=>unknown)=>next().then(resolve,reject);return q}});
 vi.stubEnv('KLGCR_GMAIL_WEB_APP_URL','https://script.google.com/test/exec');vi.stubEnv('KLGCR_GMAIL_WEB_APP_SECRET','test-secret');vi.spyOn(console,'error').mockImplementation(()=>{});
 const fetcher=vi.fn(async(_url:unknown,init:RequestInit)=>{const payload=JSON.parse(String(init.body));if(withReceipt){expect(payload.action).toBe('finance-send');expect(payload.pdfBase64).toMatch(/^JVBERi0/);expect(payload.html).toContain('Your membership QR code');}return new Response(JSON.stringify(accepted?{ok:true,status:'sent',sender:'klgcr.noreply@gmail.com',to:'member@example.test',key:payload.key}:{ok:false,error:'Unauthorized'}));});vi.stubGlobal('fetch',fetcher);
 expect(await deliverMembershipEmails('member')).toBe(accepted?1:0);
 expect(fetcher).toHaveBeenCalledOnce();expect(writes.at(-1)?.value.status).toBe(accepted?'sent':'pending');
});
