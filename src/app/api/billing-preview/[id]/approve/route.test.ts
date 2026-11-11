import {beforeEach,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {BILLING_APPROVER_ID} from '@/lib/billing-approval';
const mocks=vi.hoisted(()=>({profile:vi.fn(),rpc:vi.fn(),db:vi.fn(),after:vi.fn(),admin:vi.fn()}));
vi.mock('next/server',async original=>({...await original<typeof import('next/server')>(),after:mocks.after}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:mocks.admin}));
vi.mock('@/lib/auth',()=>({getSessionProfile:mocks.profile}));
vi.mock('@/lib/supabase/server',()=>({createClient:mocks.db}));
import {POST} from './route';
const id='11111111-1111-4111-8111-111111111111';
const request=(origin='https://example.test')=>new NextRequest(`https://example.test/api/billing-preview/${id}/approve`,{method:'POST',headers:{origin}});
beforeEach(()=>{vi.clearAllMocks();mocks.db.mockResolvedValue({rpc:mocks.rpc});mocks.profile.mockResolvedValue({id:BILLING_APPROVER_ID,role:'admin'});vi.stubEnv('BILLING_DISABLED','false')});
it.each([null,{id:'other',role:'admin'},{id:BILLING_APPROVER_ID,role:'management_viewer'}])('denies anyone other than James before DB access',async p=>{mocks.profile.mockResolvedValue(p);expect((await POST(request(),{params:Promise.resolve({id})})).status).toBe(403);expect(mocks.db).not.toHaveBeenCalled()});
it('rejects cross-site approval',async()=>{expect((await POST(request('https://evil.test'),{params:Promise.resolve({id})})).status).toBe(403);expect(mocks.db).not.toHaveBeenCalled()});
it('requires James saved signature and does not pretend approval succeeded',async()=>{mocks.rpc.mockResolvedValue({error:{message:'Save your signature before approving'}});const r=await POST(request(),{params:Promise.resolve({id})});expect(r.status).toBe(409);expect((await r.json()).error).toContain('E-signature')});
it('uses the saved approval and returns before attempting Gmail delivery',async()=>{
 mocks.rpc.mockResolvedValue({data:{run_id:id,approved_by:'James'}});
 mocks.admin.mockImplementation(()=>{throw Error('Gmail unavailable');});
 const r=await POST(request(),{params:Promise.resolve({id})});
 expect(r.status).toBe(200);
 expect(mocks.rpc).toHaveBeenCalledWith('approve_billing_run',{billing_run_id:id});
 expect(await r.json()).toMatchObject({approval:{approved_by:'James'},mail:{status:'pending'}});
 expect(mocks.after).toHaveBeenCalledOnce();
 expect(mocks.admin).not.toHaveBeenCalled();
 const logged=vi.spyOn(console,'error').mockImplementation(()=>{});
 try {
  const [background]=mocks.after.mock.calls[0] as [()=>Promise<void>];
  await expect(background()).resolves.toBeUndefined();
  expect(mocks.admin).toHaveBeenCalledOnce();
 } finally {
  logged.mockRestore();
 }
});
