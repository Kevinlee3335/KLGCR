// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest';

const {retry}=vi.hoisted(()=>({retry:vi.fn()}));
vi.mock('@/lib/billing-mail',()=>({retryQueuedBillingMail:retry}));
import {GET} from './route';

const request=(secret?:string)=>new Request('https://example.test/api/cron/billing-mail',{
 headers:secret?{authorization:`Bearer ${secret}`}:undefined,
});

beforeEach(()=>{
 retry.mockReset();
 vi.stubEnv('CRON_SECRET','test-secret');
 vi.stubEnv('BILLING_DISABLED','false');
});
afterEach(()=>vi.unstubAllEnvs());

it('requires cron authentication before touching the queue',async()=>{
 expect((await GET(request())).status).toBe(401);
 expect((await GET(request('wrong-secret'))).status).toBe(401);
 expect(retry).not.toHaveBeenCalled();
});

it('skips automatic deliveries when billing is disabled',async()=>{
 vi.stubEnv('BILLING_DISABLED','true');
 expect(await (await GET(request('test-secret'))).json()).toEqual({skipped:true});
 expect(retry).not.toHaveBeenCalled();
});

it('reports the bounded worker result to the scheduler',async()=>{
 retry.mockResolvedValue({claimed:3,sent:2});
 expect(await (await GET(request('test-secret'))).json()).toEqual({claimed:3,sent:2});
 expect(retry).toHaveBeenCalledOnce();
});
