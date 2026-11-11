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
 it('replaces only the selected meter photo and keeps the other evidence by account',async()=>{
  const original=await setup();
  const first=original.utilityAccounts[0], second=original.utilityAccounts[1];
  second.meters[0].id=first.meters[0].id;
  second.meters[0].photo='data:image/jpeg;base64,Yw==';
  const {stripBillingMeterPhotos}=await import('@/lib/billing-meter-photo');
  const incoming=stripBillingMeterPhotos(original);
  incoming.utilityAccounts[0].meters[0].previousPhoto='data:image/jpeg;base64,ZA==';
  incoming.utilityAccounts[1].meters[0].photo='data:image/jpeg;base64,ZQ==';
  let written:typeof original|undefined;
  mocks.db.mockResolvedValue({from:()=>({
   select(){return this},eq(){return this},
   single:async()=>({data:{config:original},error:null}),
   update(value:{config:typeof original}){written=value.config;return this},
   maybeSingle:async()=>({data:{revision:2},error:null}),
  })});
  const response=await POST(new NextRequest('https://example.test/api/billing-preview',{
   method:'POST',headers:{origin:'https://example.test'},body:JSON.stringify({
    action:'save_meter_photo',config:incoming,revision:1,
    target:{accountId:first.id,meterId:first.meters[0].id,side:'previousPhoto'},
   }),
  }));
  expect(response.status).toBe(200);
  expect(written?.utilityAccounts[0].meters[0]).toMatchObject({
   photo:'data:image/jpeg;base64,YQ==',previousPhoto:'data:image/jpeg;base64,ZA==',
  });
  expect(written?.utilityAccounts[1].meters[0].photo).toBe('data:image/jpeg;base64,Yw==');
 });
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

describe("on-demand billing views", () => {
 const packId = "8bd6ec77-c15c-4c2a-9b09-e4ba8295d0bf";
 const otherPackId = "ea7c45ca-4d9f-4fe2-8947-d8a05336cf57";
 const photo = "data:image/jpeg;base64,YQ==";
 const previousPhoto = "data:image/jpeg;base64,Yg==";
 const otherPhoto = "data:image/jpeg;base64,Yw==";
 const signature = { strokes: [[[0.2, 0.2], [0.5, 0.7]]] };
 const fields = { id: packId, kind: "utility", period: "2026-11", issue_date: "2026-11-11", total: 38 };
 const mail = { run_id: packId, status: "sent", sent_at: "2026-11-11T01:30:00Z", error: null };

 function request(query: string) {
  return new NextRequest(`https://example.test/api/billing-preview?${query}`);
 }

 async function setup() {
  vi.stubEnv("BILLING_DISABLED", "false");
  mocks.profile = { id: "another-admin", role: "admin", full_name: "Kevin" };
  const { configSchema, defaultBillingConfig } = await import("@/lib/billing-preview");
  const fixture = (await import("@/lib/billing-preview-fixture.json")).default;
  const config = configSchema.parse({ ...defaultBillingConfig, ...fixture, utilityPeriod: "2026-11" });
  const [first, second] = config.utilityAccounts;
  Object.assign(first.meters[0], { photo, previousPhoto });
  second.meters[0].photo = otherPhoto;
  return { config, first, second };
 }

 it("loads only settings on overview and omits meter evidence", async () => {
  const { config } = await setup();
  const from = vi.fn((table: string) => {
   expect(table).toBe("billing_preview_settings");
   return {
    select() { return this; },
    eq() { return this; },
    single: async () => ({ data: { config, revision: 17 }, error: null }),
   };
  });
  mocks.db.mockResolvedValue({ from });

  const response = await GET(request("view=overview"));
  expect(response.status).toBe(200);
  const overview = await response.json();
  expect(from.mock.calls).toEqual([["billing_preview_settings"]]);
  expect(overview).toMatchObject({ revision: 17, photosLoaded: false, pendingPackCount: 0 });
  expect(overview.config.utilityAccounts[0].meters[0].photo).toBeUndefined();
  expect(overview.config.utilityAccounts[0].meters[0].previousPhoto).toBeUndefined();
  expect(overview).not.toHaveProperty("runs");
 });

 it("adds a metadata-only pending count for the billing approver", async () => {
  const { config } = await setup();
  const { BILLING_APPROVER_ID } = await import("@/lib/billing-approval");
  mocks.profile = { id: BILLING_APPROVER_ID, role: "admin", full_name: "James" };
  const count = vi.fn(() => ({ is: async () => ({ count: 3, error: null }) }));
  mocks.db.mockResolvedValue({ from: (table: string) => table === "billing_preview_runs" ? { select: count } : {
   select() { return this; },
   eq() { return this; },
   single: async () => ({ data: { config, revision: 18 }, error: null }),
  } });

  const response = await GET(request("view=overview"));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ pendingPackCount: 3 });
  expect(count).toHaveBeenCalledWith("id,billing_run_approvals!left(run_id)", { head: true, count: "exact" });
 });

 it("reads metadata and workflow state for history without selecting snapshots", async () => {
  await setup();
  const { BILLING_APPROVER_ID } = await import("@/lib/billing-approval");
  const selectRuns = vi.fn((columns: string) => {
   expect(columns).not.toContain("snapshot");
   return {
    order() { return this; },
    limit: async () => ({ data: [fields, { ...fields, id: otherPackId }], error: null }),
   };
  });
  const related: Record<string, unknown[]> = {
   billing_run_approvals: [
    { run_id: packId, approved_by_user: BILLING_APPROVER_ID, approved_at: "2026-11-11T01:20:00Z", signature },
    { run_id: otherPackId, approved_by_user: "another-user", approved_at: "2026-11-11T01:20:00Z", signature },
   ],
   billing_mail_dispatch: [mail],
   document_verifications: [{ document_id: packId, entries: [{}, {}] }],
  };
  mocks.db.mockResolvedValue({ from: (table: string) => table === "billing_preview_runs" ? { select: selectRuns } : {
   select() { return this; },
   eq() { return this; },
   in: async () => ({ data: related[table], error: null }),
  } });

  const response = await GET(request("view=history"));
  expect(response.status).toBe(200);
  expect(selectRuns.mock.calls[0][0]).not.toContain("snapshot");
  const { runs } = await response.json();
  expect(runs).toEqual([
   { ...fields, verifiedCount: 2, approved: true, mail },
   { ...fields, id: otherPackId, verifiedCount: 0, approved: false, mail: null },
  ]);
 });

 it.each([
  [`id=${packId}`, [["id", packId]]],
  ["kind=utility&period=2026-11", [["kind", "utility"], ["period", "2026-11"]]],
 ])("loads the selected frozen pack and its recorded signature via %s", async (selector, expectedFilters) => {
  await setup();
  const { BILLING_APPROVER_ID } = await import("@/lib/billing-approval");
  const verifications = [{ user_id: "fikri" }, { user_id: "kevin" }];
  const approval = {
   run_id: packId, approved_by_user: BILLING_APPROVER_ID, approved_by: "James",
   approved_at: "2026-11-11T01:20:00Z", signature, verifications,
  };
  const snapshot = {
   lines: [{ details: [{ photo, previousPhoto, currentDate: "2026-11-10" }] }],
   issueDate: fields.issue_date,
   approval: { approved_by: "untrusted snapshot" },
  };
  const filtered: string[][] = [];
  mocks.db.mockResolvedValue({ from: (table: string) => table === "billing_preview_runs" ? {
   select() { return this; },
   eq(key: string, value: string) { filtered.push([key, value]); return this; },
   maybeSingle: async () => ({ data: { ...fields, snapshot }, error: null }),
  } : {
   select() { return this; },
   eq() { return this; },
   in: async () => ({
    data: table === "billing_run_approvals" ? [approval]
     : table === "document_verifications" ? [{ document_id: packId, entries: verifications }] : [mail],
    error: null,
   }),
  } });

  const response = await GET(request(`view=pack&${selector}`));
  expect(response.status).toBe(200);
  expect(filtered).toEqual(expectedFilters);
  expect(await response.json()).toEqual({
   pack: { ...fields, verifiedCount: 2, approved: true, mail, snapshot: { ...snapshot, approval } },
  });
 });

 it("returns a missing pack as null and rejects an invalid selector before database access", async () => {
  await setup();
  mocks.db.mockClear().mockResolvedValue({ from: () => ({
   select() { return this; },
   eq() { return this; },
   maybeSingle: async () => ({ data: null, error: null }),
  }) });
  expect((await GET(request("view=pack&id=invalid"))).status).toBe(400);
  expect((await GET(request("view=pack&kind=utility&period=2026-13"))).status).toBe(400);
  expect(mocks.db).not.toHaveBeenCalled();
  const response = await GET(request(`view=pack&id=${packId}`));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ pack: null });
 });

 it("returns only the selected account photos with the settings revision", async () => {
  const { config, first, second } = await setup();
  const from = vi.fn((table: string) => {
   expect(table).toBe("billing_preview_settings");
   return {
    select() { return this; },
    eq() { return this; },
    single: async () => ({ data: { config, revision: 19 }, error: null }),
   };
  });
  mocks.db.mockResolvedValue({ from });

  const response = await GET(request(`view=photos&account=${encodeURIComponent(first.id)}`));
  expect(response.status).toBe(200);
  const selected = await response.json();
  expect(selected).toMatchObject({ period: "2026-11", revision: 19 });
  expect(selected.accounts).toHaveLength(1);
  expect(selected.accounts[0].meters[0]).toEqual({ id: first.meters[0].id, photo, previousPhoto });
  expect(selected).not.toHaveProperty("config");

  const all = await (await GET(request("view=photos"))).json();
  expect(all.accounts.find((account: {id: string}) => account.id === second.id).meters[0].photo).toBe(otherPhoto);
  expect((await GET(request("view=photos&account=missing"))).status).toBe(404);
  expect(from.mock.calls.every(([table]) => table === "billing_preview_settings")).toBe(true);
 });
});
