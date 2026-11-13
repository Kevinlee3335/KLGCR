// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest';

const {retry,compliance,unifi}=vi.hoisted(()=>({retry:vi.fn(),compliance:vi.fn(),unifi:vi.fn()}));
vi.mock('@/lib/billing-mail',()=>({retryQueuedBillingMail:retry}));
vi.mock('@/lib/compliance-approval-delivery',()=>({retryQueuedComplianceMail:compliance}));
vi.mock('@/lib/unifi-invoice-mail',()=>({retryQueuedUnifiInvoiceMail:unifi}));
import {GET} from './route';

const request=(secret?:string)=>new Request('https://example.test/api/cron/billing-mail',{
 headers:secret?{authorization:`Bearer ${secret}`}:undefined,
});

beforeEach(()=>{
 retry.mockReset();
 compliance.mockReset();
 unifi.mockReset();
 vi.stubEnv('CRON_SECRET','test-secret');
 vi.stubEnv('BILLING_DISABLED','false');
});
afterEach(()=>vi.unstubAllEnvs());

it('requires cron authentication before touching the queue',async()=>{
 expect((await GET(request())).status).toBe(401);
 expect((await GET(request('wrong-secret'))).status).toBe(401);
 expect(retry).not.toHaveBeenCalled();
 expect(compliance).not.toHaveBeenCalled();
 expect(unifi).not.toHaveBeenCalled();
});

it('skips automatic deliveries when billing is disabled',async()=>{
 vi.stubEnv('BILLING_DISABLED','true');
 expect(await (await GET(request('test-secret'))).json()).toEqual({skipped:true});
 expect(retry).not.toHaveBeenCalled();
 expect(compliance).toHaveBeenCalledOnce();
 expect(unifi).toHaveBeenCalledOnce();
});

it('reports the bounded worker result to the scheduler',async()=>{
 retry.mockResolvedValue({claimed:3,sent:2});
 expect(await (await GET(request('test-secret'))).json()).toEqual({claimed:3,sent:2});
 expect(retry).toHaveBeenCalledOnce();
 expect(compliance).toHaveBeenCalledOnce();
});

it('preserves billing retries if the compliance or Unifi outbox is unavailable',async()=>{
 retry.mockResolvedValue({claimed:1,sent:1});
 compliance.mockRejectedValue(Error('temporary database problem'));
 unifi.mockRejectedValue(Error('temporary database problem'));
 expect(await (await GET(request('test-secret'))).json()).toEqual({claimed:1,sent:1});
});
