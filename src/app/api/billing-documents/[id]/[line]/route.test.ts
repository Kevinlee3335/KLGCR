import {beforeEach,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {makeSnapshot,defaultBillingConfig,configSchema} from '@/lib/billing-preview';
import fixture from '@/lib/billing-preview-fixture.json';
import {BILLING_APPROVER_ID} from '@/lib/billing-approval';
const mocks=vi.hoisted(()=>({profile:vi.fn(),db:vi.fn()}));vi.mock('@/lib/auth',()=>({getSessionProfile:mocks.profile}));vi.mock('@/lib/supabase/server',()=>({createClient:mocks.db}));
import {GET} from './route';
const id='11111111-1111-4111-8111-111111111111';
const snapshot=makeSnapshot('rental','2026-11','2026-11-01',configSchema.parse({...defaultBillingConfig,...fixture}),'Admin');
beforeEach(()=>{vi.clearAllMocks();mocks.profile.mockResolvedValue({role:'admin'});});
function database(approval:unknown=null){mocks.db.mockResolvedValue({from:(table:string)=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:table==='billing_preview_runs'?{id,kind:'rental',period:'2026-11',snapshot}:approval,error:null})})});}
it.each([null,{role:'cleaner'},{role:'maintenance_staff'}])('denies unauthorized access before reading billing data',async profile=>{mocks.profile.mockResolvedValue(profile);expect((await GET(new NextRequest('https://example.test/doc'),{params:Promise.resolve({id,line:'0'})})).status).toBe(403);expect(mocks.db).not.toHaveBeenCalled()});
it('opens exactly one tenant bill with the saved approval signature',async()=>{database({run_id:id,approved_by_user:BILLING_APPROVER_ID,approved_by:'James',approved_at:'2026-10-28T01:00:00Z',signature:{strokes:[[[.1,.2],[.8,.7]]]}});const response=await GET(new NextRequest('https://example.test/doc'),{params:Promise.resolve({id,line:'1'})});expect(response.status).toBe(200);const html=await response.text();expect(html).toContain(snapshot.lines[1].billNo);expect(html).not.toContain(snapshot.lines[0].billNo);expect(html).toContain('James approval signature');expect(html).toContain('(Authorised Signature)');expect(html).toContain('data:image/jpeg;base64,');expect(response.headers.get('Cache-Control')).toBe('private, no-store')});
it('downloads the original HTML and labels an unsigned bill pending',async()=>{database();const response=await GET(new NextRequest('https://example.test/doc?download=1'),{params:Promise.resolve({id,line:'0'})});expect(response.headers.get('Content-Disposition')).toContain('attachment;');expect(await response.text()).toContain('Pending James approval')});
it('rejects invalid or missing line numbers',async()=>{database();expect((await GET(new NextRequest('https://example.test/doc'),{params:Promise.resolve({id,line:'9999'})})).status).toBe(404);expect((await GET(new NextRequest('https://example.test/doc'),{params:Promise.resolve({id,line:'-1'})})).status).toBe(400)});
