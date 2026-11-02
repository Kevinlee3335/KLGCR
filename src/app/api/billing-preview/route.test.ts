vi.mock("@/lib/document-review-notifications",()=>({dispatchDocumentReviewPushes:vi.fn().mockResolvedValue(undefined)}));
vi.mock("@/lib/utility-months",()=>({ensureUtilityMonth:vi.fn().mockResolvedValue(undefined)}));
import { beforeEach,describe,it,expect,vi } from "vitest";
import { NextRequest } from "next/server";
const mocks=vi.hoisted(()=>({profile:null as null|{id:string;role:string;full_name:string},db:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSessionProfile:async()=>mocks.profile}));
vi.mock('@/lib/supabase/server',()=>({createClient:mocks.db}));
import { GET,POST } from './route';
describe('billing preview authorization',()=>{
 beforeEach(()=>{vi.stubEnv('BILLING_DISABLED','false');vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_GIT_COMMIT_REF','feature/rental-utility-billing-test');mocks.profile=null;mocks.db.mockClear()});
 it.each([null,'cleaner','maintenance_staff'])('denies profile %s before database access',async role=>{mocks.profile=role?{id:'test',role,full_name:'Test'}:null;expect((await GET(new NextRequest('https://example.test/api/billing-preview'))).status).toBe(403);expect(mocks.db).not.toHaveBeenCalled()});
 it('supports an explicit module disable switch',async()=>{vi.stubEnv('BILLING_DISABLED','true');mocks.profile={id:'test',role:'admin',full_name:'Test'};expect((await GET(new NextRequest('https://example.test/api/billing-preview'))).status).toBe(403);expect(mocks.db).not.toHaveBeenCalled()});
 it.each(['admin','management_viewer'])('rejects cross-origin writes for %s',async role=>{mocks.profile={id:'test',role,full_name:'Test'};const req=new NextRequest('https://example.test/api/billing-preview',{method:'POST',headers:{origin:'https://other.test'},body:'{}'});expect((await POST(req)).status).toBe(403);expect(mocks.db).not.toHaveBeenCalled()});
});
describe('billing read failures',()=>{beforeEach(()=>vi.stubEnv('BILLING_DISABLED','false'));
 it('returns JSON when stored meter fields are incomplete',async()=>{vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_GIT_COMMIT_REF','feature/rental-utility-billing-test');mocks.profile={id:'test',role:'admin',full_name:'Test'};mocks.db.mockResolvedValue({from:()=>({select(){return this},eq(){return this},order(){return this},single:async()=>({data:{config:{utilityAccounts:[{meters:[{photo:'data:image/jpeg;base64,YQ=='}]}]},revision:1},error:null}),limit:async()=>({data:[],error:null})})});const response=await GET(new NextRequest('https://example.test/api/billing-preview'));expect(response.status).toBe(422);expect((await response.json()).error).toMatch(/repair/)});
 it('returns JSON when database access throws',async()=>{mocks.db.mockRejectedValueOnce(Error('Connection unavailable'));const response=await GET(new NextRequest('https://example.test/api/billing-preview'));expect(response.status).toBe(503);expect((await response.json()).error).toMatch(/load billing/)});
});
describe('deferred meter photos',()=>{
 async function setup(){vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_GIT_COMMIT_REF','feature/rental-utility-billing-test');mocks.profile={id:'test',role:'admin',full_name:'Test'};const {configSchema,defaultBillingConfig}=await import('@/lib/billing-preview');const fixture=(await import('@/lib/billing-preview-fixture.json')).default;const config=configSchema.parse({...defaultBillingConfig,...fixture});config.utilityAccounts[0].meters[0].photo='data:image/jpeg;base64,YQ==';config.utilityAccounts[0].meters[0].previousPhoto='data:image/jpeg;base64,Yg==';return config}
 it('omits photo bytes initially and returns them only when requested',async()=>{const config=await setup();mocks.db.mockResolvedValue({from:()=>({select(){return this},eq(){return this},order(){return this},single:async()=>({data:{config,revision:1},error:null}),limit:async()=>({data:[],error:null})})});const first=await(await GET(new NextRequest('https://example.test/api/billing-preview'))).json();expect(first.photosLoaded).toBe(false);expect(first.config.utilityAccounts[0].meters[0].photo).toBeUndefined();const full=await(await GET(new NextRequest('https://example.test/api/billing-preview?photos=1'))).json();expect(full.photosLoaded).toBe(true);expect(full.config.utilityAccounts[0].meters[0].photo).toBe('data:image/jpeg;base64,YQ==')});
 it('preserves both photos when saving metadata before loading photos',async()=>{const original=await setup();const incoming=structuredClone(original);delete incoming.utilityAccounts[0].meters[0].photo;delete incoming.utilityAccounts[0].meters[0].previousPhoto;incoming.tenants[0].rent=900;let written:{config:import("@/lib/billing-preview").BillingConfig}|undefined;mocks.db.mockResolvedValue({from:()=>({select(){return this},eq(){return this},single:async()=>({data:{config:original},error:null}),update(v:unknown){written=v as {config:import("@/lib/billing-preview").BillingConfig};return this},maybeSingle:async()=>({data:{revision:2},error:null})})});const response=await POST(new NextRequest('https://example.test/api/billing-preview',{method:'POST',headers:{origin:'https://example.test'},body:JSON.stringify({action:'save',config:incoming,preservePhotos:true,revision:1})}));expect(response.status).toBe(200);expect(written!.config.tenants[0].rent).toBe(900);expect(written!.config.utilityAccounts[0].meters[0].photo).toBe('data:image/jpeg;base64,YQ==');expect(written!.config.utilityAccounts[0].meters[0].previousPhoto).toBe('data:image/jpeg;base64,Yg==')});
});

describe('confirmed utilities submission',()=>{
 it('uses the live Malaysia date and notifies Fikri only after the pack is saved',async()=>{
  const {dispatchDocumentReviewPushes}=await import('@/lib/document-review-notifications');
  const {configSchema,defaultBillingConfig,malaysiaClock}=await import('@/lib/billing-preview');
  const config=configSchema.parse({...defaultBillingConfig,...(await import('@/lib/billing-preview-fixture.json')).default});
  config.utilityAccounts.forEach(a=>a.meters.forEach(m=>{m.confirmed=true}));
  let inserted:Record<string,unknown>|undefined;
  mocks.profile={id:'test',role:'admin',full_name:'Kevin'};
  mocks.db.mockResolvedValue({from:(table:string)=>({select(){return this},eq(){return this},insert(value:Record<string,unknown>){inserted=value;return this},single:async()=>({data:table==='billing_preview_settings'?{config}:{id:'saved-pack'},error:null})})});
  const response=await POST(new NextRequest('https://example.test/api/billing-preview',{method:'POST',headers:{origin:'https://example.test'},body:JSON.stringify({action:'submit',kind:'utility',period:config.utilityPeriod})}));
  expect(response.status).toBe(200);expect(inserted?.issue_date).toBe(malaysiaClock().date);
  expect(await response.json()).toMatchObject({id:'saved-pack',reviewStatus:'Pending Fikri Verification'});
  expect(dispatchDocumentReviewPushes).toHaveBeenCalledWith('saved-pack');
 });
 it('rejects unconfirmed meters before creating any invoice pack',async()=>{
  const {configSchema,defaultBillingConfig}=await import('@/lib/billing-preview');
  const config=configSchema.parse({...defaultBillingConfig,...(await import('@/lib/billing-preview-fixture.json')).default});
  config.utilityAccounts[0].meters[0].confirmed=false;
  const insert=vi.fn();mocks.profile={id:'test',role:'admin',full_name:'Kevin'};
  mocks.db.mockResolvedValue({from:()=>({select(){return this},eq(){return this},single:async()=>({data:{config},error:null}),insert})});
  const response=await POST(new NextRequest('https://example.test/api/billing-preview',{method:'POST',headers:{origin:'https://example.test'},body:JSON.stringify({action:'submit',kind:'utility',period:config.utilityPeriod})}));
  expect(response.status).toBe(400);expect((await response.json()).error).toMatch(/confirm every meter/);expect(insert).not.toHaveBeenCalled();
 });
});
