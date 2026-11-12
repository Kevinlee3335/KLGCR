// @vitest-environment node
import { vi,describe,it,expect,beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
const mocks=vi.hoisted(()=>({from:vi.fn(),storage:{from:vi.fn()},results:[] as unknown[]}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>mocks}));
vi.mock('@/lib/supplier-mail/pdf-text',()=>({extractSupplierPdfText:vi.fn(async()=>({}))}));
import { POST } from './route';
function chain(result:unknown){const q:Record<string,unknown>={};for(const name of ['select','eq','is','upsert','update','insert','order'])q[name]=vi.fn(()=>q);q.maybeSingle=vi.fn(async()=>result);q.single=vi.fn(async()=>result);q.then=(resolve:(x:unknown)=>unknown)=>Promise.resolve(result).then(resolve);return q;}
const token='a'.repeat(64);
function request(body:unknown,auth=true){return new Request('https://example.com/api/supplier-mail/ingest',{method:'POST',headers:auth?{authorization:`Bearer ${token}`}:{},body:JSON.stringify(body)});}
const mail={op:'message',mailbox:'klgresidenceenquiry@gmail.com',id:'1234567890abcdef',sender:'Sigma <customercare.my@sigmamy.com>',subject:'Service Report',body:'Example',receivedAt:'2026-01-01T00:00:00Z'};
const configuredRules=[{rule:'sigmamy.com',supplier_id:'sigma'},{rule:'reports@approved.example',supplier_id:'approved'}];
beforeEach(()=>{vi.clearAllMocks();mocks.results=[];mocks.from.mockImplementation(()=>chain(mocks.results.shift() || {data:null,error:null}));});
describe('supplier ingestion',()=>{
 it('rejects missing or revoked credentials before processing data',async()=>{
  expect((await POST(request(mail,false))).status).toBe(401);expect(mocks.from).not.toHaveBeenCalled();
  mocks.results=[{data:null,error:null}];expect((await POST(request(mail))).status).toBe(401);
 });
 it('rejects pre-2023 emails, unrelated senders and another mailbox',async()=>{
  for(const data of [{...mail,receivedAt:'2022-12-31T15:59:59Z'},{...mail,sender:'Sigma <attacker@example.com>'},{...mail,mailbox:'other@gmail.com'}]){
   mocks.results=[{data:{id:'connection'},error:null},{data:configuredRules,error:null}];expect((await POST(request(data))).status).toBe(400);
  }
 });
 it('imports approved emails idempotently, without modifying Gmail',async()=>{
  mocks.results=[{data:{id:'connection'},error:null},{data:configuredRules,error:null},{data:null,error:null},{data:null,error:null}];
  expect((await POST(request(mail))).status).toBe(200);
  expect(mocks.from.mock.results[2].value.upsert).toHaveBeenCalledWith(expect.objectContaining({id:mail.id,company:'sigma'}),{onConflict:'id',ignoreDuplicates:true});
  expect(mocks.from).toHaveBeenCalledWith('supplier_emails');
 });
 it('loads configured exact senders privately and maps only approved addresses to a supplier',async()=>{
  mocks.results=[{data:{id:'connection'}},{data:configuredRules}];
  expect(await (await POST(request({op:'config',mailbox:mail.mailbox}))).json()).toEqual({senders:['sigmamy.com','reports@approved.example']});
  mocks.results=[{data:{id:'connection'}},{data:configuredRules},{data:null},{data:null}];
  expect((await POST(request({...mail,sender:'Supplier Reports <REPORTS@APPROVED.EXAMPLE>'}))).status).toBe(200);
  expect(mocks.from.mock.results[4].value.upsert).toHaveBeenCalledWith(expect.objectContaining({company:'approved'}),expect.anything());
  mocks.results=[{data:{id:'connection'}},{data:configuredRules}];
  expect((await POST(request({...mail,sender:'unlisted@approved.example'}))).status).toBe(400);
 });
 it('keeps legacy sender behavior before the registry migration and records scan heartbeat separately',async()=>{
  mocks.results=[{data:{id:'connection'}},{error:{code:'PGRST205'}},{data:null},{data:null}];
  expect((await POST(request(mail))).status).toBe(200);
  mocks.results=[{data:{id:'connection'}},{data:null}];
  expect((await POST(request({op:'heartbeat',mailbox:mail.mailbox}))).status).toBe(200);
  expect(mocks.from.mock.results.at(-1)?.value.update).toHaveBeenCalledWith({last_checked_at:expect.any(String)});
 });
 it('deduplicates a PDF by company and hash, linking another email without uploading again',async()=>{
  mocks.results=[{data:{id:'connection'}},{data:{company:'sigma',subject:'Service Report'}},{data:{id:'doc'}},{data:null,error:null}];
  const response=await POST(request({op:'prepare',id:mail.id,file:{partId:'0.1',filename:'report.pdf',hash:'b'.repeat(64),size:1024}}));
  expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,done:true});expect(mocks.storage.from).not.toHaveBeenCalled();
 });
 it('does not finalize a corrupt or mismatched PDF',async()=>{
  mocks.results=[{data:{id:'connection'}},{data:{company:'sigma',subject:'Service Report'}},{data:null,error:null}];
  const bytes=Buffer.from('%PDF-1.7 example');
  mocks.storage.from.mockReturnValue({download:vi.fn(async()=>({data:new Blob([bytes]),error:null}))});
  const response=await POST(request({op:'complete',id:mail.id,file:{partId:'0.1',filename:'report.pdf',hash:createHash('sha256').update('different').digest('hex'),size:bytes.length}}));
  expect(response.status).toBe(400);expect(mocks.from).not.toHaveBeenCalledWith('supplier_mail_attachments');
 });
 it.each([[true,'Invoice'],[false,'Other Documents']])('uses the subject only when attachment hint is %s',async(useSubjectHint,folder)=>{
  const bytes=Buffer.from('%PDF-1.7 example');
  mocks.results=[{data:{id:'connection'}},{data:{company:'sigma',subject:'Invoice 42'}},{data:null},{data:null},{data:{id:'doc'}},{data:null}];
  mocks.storage.from.mockReturnValue({download:vi.fn(async()=>({data:new Blob([bytes]),error:null}))});
  const file={partId:'0.1',filename:'scan.pdf',hash:createHash('sha256').update(bytes).digest('hex'),size:bytes.length,useSubjectHint};
  expect((await POST(request({op:'complete',id:mail.id,file}))).status).toBe(200);
  expect(mocks.from.mock.results[3].value.upsert).toHaveBeenCalledWith(expect.objectContaining({folder}),expect.anything());
 });
});
