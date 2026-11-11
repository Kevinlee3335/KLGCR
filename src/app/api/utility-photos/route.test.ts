// @vitest-environment node
import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";
import {defaultBillingConfig, type BillingConfig} from "@/lib/billing-preview";
import {UTILITY_PHOTO_STAFF_ID} from "@/lib/utility-photo-access";

const mocks = vi.hoisted(() => ({profile: vi.fn(), admin: vi.fn(), ocr: vi.fn(), after: vi.fn(), ensure: vi.fn()}));
vi.mock("next/server", async importOriginal => ({...await importOriginal<typeof import("next/server")>(), after: mocks.after}));
vi.mock("@/lib/auth", () => ({getSessionProfile: mocks.profile}));
vi.mock("@/lib/supabase/admin", () => ({createAdminClient: mocks.admin}));
vi.mock("@/lib/meter-ocr-server", () => ({readMeterPhoto: mocks.ocr}));
vi.mock("@/lib/utility-months", () => ({ensureUtilityMonth: mocks.ensure}));
import {GET, POST} from "./route";

const db = new PGlite();
const period = "2026-11";
const photo = "data:image/jpeg;base64,YQ==";
const previousPhoto = "data:image/jpeg;base64,Yg==";
const meter = {id: "electric", label: "Electric", serial: "E1", unit: "kWh", role: "charge", rate: .6, prev: 10, curr: 20, confirmed: true, previousPhoto} as const;
const account = {id: "a", seq: 1, name: "Account", addr: [], title: "", subsidy: 0, cap: null, kind: "invoice", meters: [meter]} as const;
const baseline: BillingConfig = {...defaultBillingConfig, utilityPeriod: period, utilityAccounts: [
 {...account, addr: [], meters: [{...meter}, {...meter, id: "water", label: "Water", unit: "m³", photo: previousPhoto}]},
 {...account, id: "other", seq: 2, addr: [], meters: [{...meter, photo: previousPhoto}]},
]};

beforeAll(async () => {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create function public.current_role() returns text language sql as $$select 'admin'::text$$;
 create table public.billing_preview_settings(id integer primary key, config jsonb not null, revision integer not null, updated_at timestamptz, updated_by uuid);`);
 for (const path of [
  "20261102050100_allow_server_utility_meter_photo_access.sql",
  "20261102065115_utility_monthly_reading_archive.sql",
  "20261111085257_scope_utility_meter_photo_readings.sql",
 ]) await db.exec(readFileSync(`supabase/migrations/${path}`, "utf8"));
}, 30_000);
afterAll(async () => db.close());
afterEach(async () => {await db.exec("rollback")});

async function stored() {
 return (await db.query<{config: BillingConfig; revision: number; updated_by: string}>("select config,revision,updated_by from billing_preview_settings where id = 1")).rows[0];
}

async function updateConfig(edit: (config: BillingConfig) => void) {
 const {config} = await stored();
 edit(config);
 await db.query("update billing_preview_settings set config=$1,revision=revision+1 where id=1", [config]);
}

beforeEach(async () => {
 await db.exec("begin");
 await db.query("insert into billing_preview_settings (id, config, revision) values (1, $1, 2)", [baseline]);
 mocks.after.mockReset();
 mocks.ensure.mockReset().mockResolvedValue(undefined);
 mocks.ocr.mockReset().mockResolvedValue({reading: null, confidence: "low", note: "Unclear"});
 mocks.profile.mockResolvedValue({id: UTILITY_PHOTO_STAFF_ID, username: "faiz", full_name: "Faiz", role: "maintenance_staff", is_active: true});
 mocks.admin.mockImplementation(() => ({
  async rpc(name: string, params: Record<string, unknown>) {
   const names = Object.keys(params).map((key, index) => `${key} => $${index + 1}`).join(", ");
   const {rows} = await db.query<{data: unknown}>(`select public.${name}(${names}) data`, Object.values(params));
   return {data: rows[0].data, error: null};
  },
  from() {throw Error("The meter API should use scoped RPCs")},
 }));
});

function post(patch: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
 return new NextRequest("https://example.com/api/utility-photos", {method: "POST",
  headers: {origin: "https://example.com", "content-type": "application/json", ...headers},
  body: JSON.stringify({period, revision: 2, accountId: "a", meterId: "electric", photo, ...patch}),
 });
}
function get(params: Record<string, string> = {}) {
 return new NextRequest(`https://example.com/api/utility-photos?${new URLSearchParams(params)}`);
}
const asyncHeaders = {prefer: "respond-async", "x-utility-photo-response": "meter"};
const readingQuery = (reading: string, patch: Record<string, string> = {}) => get({reading, period, account: "a", meter: "electric", ...patch});

async function runBackgroundJob(index = 0) {
 const [job] = mocks.after.mock.calls[index] as [() => Promise<void>];
 await job();
}

async function targetMeter() {return (await stored()).config.utilityAccounts[0].meters[0]}

describe("Utilities photo API and scoped database writes", () => {
 it("persists evidence before OCR and polls only the exact run", async () => {
  mocks.ocr.mockResolvedValue({reading: 155, confidence: "high", note: "Clear"});
  const response = await POST(post({}, asyncHeaders));
  expect(response.status).toBe(202);
  const capture = await response.json();
  expect(capture).toMatchObject({accountId: "a", readingPending: true, revision: 3, meter: {id: "electric", curr: null, confirmed: false}});
  expect(capture).not.toHaveProperty("accounts");
  expect(capture.meter).not.toHaveProperty("photo");
  expect(capture.meter).not.toHaveProperty("previousPhoto");
  expect(capture.meter).not.toHaveProperty("rate");
  expect(await targetMeter()).toMatchObject({photo, previousPhoto, curr: null, confirmed: false});
  expect(mocks.ocr).not.toHaveBeenCalled();
  expect(await (await GET(readingQuery(capture.readingId))).json()).toMatchObject({status: "pending", revision: 3});
  expect(await (await GET(readingQuery(capture.readingId, {account: "other"}))).json()).toMatchObject({status: "superseded"});
  expect(await (await GET(readingQuery(capture.readingId, {meter: "water"}))).json()).toMatchObject({status: "superseded"});
  expect(await (await GET(readingQuery(capture.readingId, {period: "2026-12"}))).json()).toMatchObject({status: "superseded"});
  expect(mocks.ensure).toHaveBeenCalledTimes(1);
  await runBackgroundJob();
  expect(mocks.ocr).toHaveBeenCalledWith(expect.objectContaining({meterId: "electric", photo}), UTILITY_PHOTO_STAFF_ID, {reservationRetries: 2});
  expect(await (await GET(readingQuery(capture.readingId))).json()).toMatchObject({status: "read", reading: 155, revision: 4});
  expect(await targetMeter()).toMatchObject({photo, curr: 155, confirmed: false});
  expect((await stored()).updated_by).toBe(UTILITY_PHOTO_STAFF_ID);
  await runBackgroundJob();
  expect((await stored()).revision).toBe(4);
 });

 it("preserves legacy account responses and scopes which meter photos are returned", async () => {
  const captured = await (await POST(post())).json();
  expect(captured.accounts[0].meters[0]).toMatchObject({photo, previousPhoto});
  expect(captured.accounts[0].meters[1].photo).toBe(previousPhoto);
  expect(captured.accounts[1].meters[0]).not.toHaveProperty("photo");
  expect(captured).not.toHaveProperty("config");
  const list = await (await GET(get())).json();
  expect(list.accounts[0].meters[0]).not.toHaveProperty("photo");
  const single = await (await GET(get({account: "a", meter: "electric"}))).json();
  expect(single.accounts[0].meters[0].photo).toBe(photo);
  expect(single.accounts[0].meters[1]).not.toHaveProperty("photo");
  expect(single.accounts[0].meters[0]).not.toHaveProperty("rate");
 });

 it("merges an old-revision upload and OCR after unrelated Admin changes", async () => {
  await updateConfig(config => {config.utilityAccounts[0].name = "Renamed"});
  mocks.ocr.mockImplementation(async () => {
   await updateConfig(config => {config.utilityAccounts[1].title = "Another company edited"});
   return {reading: 55, confidence: "high", note: ""};
  });
  const response = await POST(post());
  expect(response.status).toBe(200);
  expect((await response.json()).message).toContain("55");
  const saved = await stored();
  expect(saved.revision).toBe(6);
  expect(saved.config.utilityAccounts[0].name).toBe("Renamed");
  expect(saved.config.utilityAccounts[0].meters[0]).toMatchObject({curr: 55, photo, previousPhoto, rate: .6});
  expect(saved.config.utilityAccounts[1]).toMatchObject({title: "Another company edited", meters: [{curr: 20, photo: previousPhoto}]});
  expect(saved.config.tenants).toEqual(baseline.tenants);
 });

 it("rejects stale target changes, unknown revisions, wrong months, and ineligible accounts", async () => {
  await updateConfig(config => {config.utilityAccounts[0].meters[0].curr = 25; config.utilityAccounts[1].first = "2026-12"});
  expect((await POST(post())).status).toBe(409);
  expect((await POST(post({revision: 1}))).status).toBe(409);
  expect((await POST(post({period: "2026-10"}))).status).toBe(409);
  expect((await POST(post({accountId: "other"}))).status).toBe(404);
  expect((await POST(post({meterId: "missing"}))).status).toBe(404);
  expect((await targetMeter()).curr).toBe(25);
  expect((await stored()).revision).toBe(3);
 });

 it("rejects stale identical retakes and discards the earlier OCR even when photos have identical bytes", async () => {
  const first = await (await POST(post({}, asyncHeaders))).json();
  const second = await (await POST(post({revision: 3}, asyncHeaders))).json();
  expect(first.readingId).not.toBe(second.readingId);
  expect((await POST(post({revision: 3}, asyncHeaders))).status).toBe(409);
  mocks.ocr.mockResolvedValueOnce({reading: 55, confidence: "high", note: "old"});
  await runBackgroundJob(0);
  expect(await (await GET(readingQuery(first.readingId))).json()).toMatchObject({status: "superseded"});
  expect(await (await GET(readingQuery(second.readingId))).json()).toMatchObject({status: "pending"});
  expect((await targetMeter()).curr).toBeNull();
  mocks.ocr.mockResolvedValueOnce({reading: 65, confidence: "high", note: "new"});
  await runBackgroundJob(1);
  expect((await targetMeter()).curr).toBe(65);
 });

 it("preserves a manual correction while automatic reading is running", async () => {
  const capture = await (await POST(post({}, asyncHeaders))).json();
  await updateConfig(config => {config.utilityAccounts[0].meters[0].curr = 45; config.utilityAccounts[0].meters[0].confirmed = true});
  mocks.ocr.mockResolvedValue({reading: 55, confidence: "high", note: ""});
  await runBackgroundJob();
  const latest = await (await GET(readingQuery(capture.readingId))).json();
  expect(latest).toMatchObject({status: "superseded", revision: 4, replacePhotos: false, meter: {curr: 45, confirmed: true}});
  expect(latest.meter).not.toHaveProperty("photo");
  expect(await targetMeter()).toMatchObject({curr: 45, confirmed: true});
 });

 it("reconciles a later Admin correction or retake when a completed run is polled", async () => {
  const capture = await (await POST(post({}, asyncHeaders))).json();
  mocks.ocr.mockResolvedValue({reading: 55, confidence: "high", note: ""});
  await runBackgroundJob();
  await updateConfig(config => {config.utilityAccounts[0].meters[0].curr = 65; config.utilityAccounts[0].meters[0].confirmed = true});
  const corrected = await (await GET(readingQuery(capture.readingId))).json();
  expect(corrected).toMatchObject({status: "superseded", revision: 5, replacePhotos: false, meter: {curr: 65, confirmed: true}});
  expect(corrected.meter).not.toHaveProperty("photo");
  expect(corrected.meter).not.toHaveProperty("rate");
  await updateConfig(config => {const current = config.utilityAccounts[0].meters[0]; current.photo = previousPhoto; current.curr = null; current.confirmed = false});
  const retaken = await (await GET(readingQuery(capture.readingId))).json();
  expect(retaken).toMatchObject({status: "superseded", revision: 6, replacePhotos: true, meter: {photo: previousPhoto, curr: null, confirmed: false}});
  expect(retaken).not.toHaveProperty("accounts");
 });

 it("discards automatic readings after a month rollover", async () => {
  const capture = await (await POST(post({}, asyncHeaders))).json();
  await updateConfig(config => {config.utilityPeriod = "2026-12"});
  mocks.ocr.mockResolvedValue({reading: 55, confidence: "high", note: ""});
  await runBackgroundJob();
  expect(await (await GET(readingQuery(capture.readingId))).json()).toMatchObject({status: "superseded"});
  expect((await targetMeter()).curr).toBeNull();
 });

 it.each([{reading: 30, confidence: "low"}, {reading: 5, confidence: "high"}])("keeps evidence and promptly reports when OCR needs review (%o)", async result => {
  const capture = await (await POST(post({}, asyncHeaders))).json();
  mocks.ocr.mockResolvedValue({...result, note: ""});
  await runBackgroundJob();
  expect(await (await GET(readingQuery(capture.readingId))).json()).toMatchObject({status: "manual", reading: null});
  expect(await targetMeter()).toMatchObject({photo, curr: null});
 });

 it("keeps evidence when OCR or its background scheduler is unavailable", async () => {
  mocks.after.mockImplementationOnce(() => {throw Error("Scheduler unavailable")});
  const response = await POST(post({}, asyncHeaders));
  expect(response.status).toBe(200);
  expect((await response.json()).message).toContain("Admin can enter the reading or use Read photo again");
  expect(mocks.ocr).not.toHaveBeenCalled();
  mocks.ocr.mockRejectedValue(Error("Budget"));
  const capture = await (await POST(post({revision: 3}, asyncHeaders))).json();
  await runBackgroundJob(1);
  expect(await (await GET(readingQuery(capture.readingId))).json()).toMatchObject({status: "unavailable", reading: null});
  expect(await targetMeter()).toMatchObject({photo, curr: null});
 });

 it("denies unauthorized users, invalid origins and invalid request fields", async () => {
  expect((await POST(post({config: {rent: 0}}))).status).toBe(400);
  expect((await POST(post({}, {origin: "https://other.com"}))).status).toBe(403);
  expect((await GET(readingQuery("invalid"))).status).toBe(400);
  for (const profile of [null, {id: "other", role: "maintenance_staff", is_active: true}, {id: UTILITY_PHOTO_STAFF_ID, role: "maintenance_staff", is_active: false}]) {
   mocks.profile.mockResolvedValue(profile);
   expect((await GET(get())).status).toBe(403);
   expect((await POST(post())).status).toBe(403);
  }
  expect((await stored()).revision).toBe(2);
 });

 it("grants tracker access and scoped RPC execution only to the server role", async () => {
  const {rows} = await db.query<{role: string; allowed: boolean}>(`select role, (
   has_table_privilege(role,'utility_meter_photo_readings','SELECT') or
   has_function_privilege(role,'get_utility_meter_photos(text,text)','EXECUTE') or
   has_function_privilege(role,'get_utility_meter_photo_reading(text,text,text,uuid)','EXECUTE') or
   has_function_privilege(role,'save_utility_meter_photo(text,integer,text,text,text,text,uuid)','EXECUTE') or
   has_function_privilege(role,'finish_utility_meter_photo_reading(text,text,text,uuid,text,numeric,uuid)','EXECUTE')
  ) allowed from unnest(array['anon','authenticated','service_role']) as role`);
  expect(rows).toEqual([{role: "anon", allowed: false}, {role: "authenticated", allowed: false}, {role: "service_role", allowed: true}]);
  await db.exec("set local role service_role");
  const {rows: [save]} = await db.query<{result: {status: string}}>("select save_utility_meter_photo($1, 2, 'a', 'electric', $2, '2026-11-11', $3) result", [period, photo, UTILITY_PHOTO_STAFF_ID]);
  expect(save.result.status).toBe("saved");
 });
});
