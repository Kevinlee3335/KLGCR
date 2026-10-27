// @vitest-environment node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe,it,expect } from 'vitest';
function script(fail=false){
 const props=new Map<string,string>([['KLGCR_ARCHIVE_ORIGIN','https://klgcr-maintenance-system.vercel.app'],['KLGCR_ARCHIVE_TOKEN','a'.repeat(64)]]);
 const posts:Record<string,unknown>[]=[],queries:{q:string}[]=[],triggers:string[]=[];
 const ctx=vm.createContext({console,Date,PropertiesService:{getScriptProperties:()=>({getProperty:(k:string)=>props.get(k),setProperty:(k:string,v:string)=>props.set(k,v),deleteProperty:(k:string)=>props.delete(k)})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},Gmail:{Users:{getProfile:()=>({emailAddress:'klgresidenceenquiry@gmail.com'}),Messages:{list:(_u:string,q:{q:string})=>{queries.push(q);return {messages:[{id:'1234567890abcdef'}]}},get:()=>({internalDate:String(Date.parse('2026-01-01T00:00:00Z')),payload:{headers:[{name:'from',value:'Sigma <customercare.my@sigmamy.com>'},{name:'subject',value:'Service Report'}],parts:[]},snippet:'Test'})}}},UrlFetchApp:{fetch:(_url:string,args:{payload:string})=>{posts.push(JSON.parse(args.payload));return {getResponseCode:()=>fail?500:200,getContentText:()=>'{"ok":true}'}}},ScriptApp:{getProjectTriggers:()=>[],newTrigger:(n:string)=>({timeBased:()=>({everyMinutes:()=>({create:()=>triggers.push(n)})})})}});
 vm.runInContext(readFileSync('public/supplier-mail/sync.gs','utf8'),ctx);
 return {ctx,props,posts,queries,triggers};
}
describe('Gmail sync cursor and read-only contract',()=>{
 it('requires company account, scopes readonly, and searches only approved senders since 2023',()=>{
  const {ctx,props,posts,queries,triggers}=script();vm.runInContext('install()',ctx);
  expect(queries.length).toBe(2);expect(posts.length).toBe(2);expect(triggers).toEqual(['syncSupplierMail']);
  expect(queries[1].q).toContain('after:1672502399');expect(queries[1].q).toContain('from:sigmamy.com from:mfetsb@gmail.com');
  expect(props.get('BACKFILL_DONE')).toBe('true');
  const manifest=JSON.parse(readFileSync('public/supplier-mail/appsscript.json','utf8'));
  expect(manifest.oauthScopes).toContain('https://www.googleapis.com/auth/gmail.readonly');
  expect(manifest.oauthScopes.some((s:string)=>s.includes('gmail.modify')||s.includes('gmail.send')||s==='https://mail.google.com/')).toBe(false);
 });
 it('does not schedule or advance cursors when the archive rejects a message',()=>{
  const {ctx,props,triggers}=script(true);expect(()=>vm.runInContext('install()',ctx)).toThrow('Archive HTTP 500');
  expect(props.get('LIVE_THROUGH')).toBeUndefined();expect(props.get('BACKFILL_DONE')).toBeUndefined();expect(triggers).toEqual([]);
 });
});

describe('Gmail attachment decoding',()=>{
 it('normalizes missing padding and both base64 alphabets without altering PDF bytes',()=>{
  const {ctx}=script();
  ctx.Utilities={base64Decode:(value:string)=>{if(value.length%4 || /[-_]/.test(value))throw new Error('Could not decode string');return Array.from(Buffer.from(value,'base64'));}};
  for(const bytes of [Buffer.from('%PDF-1.7'),Buffer.from([255,254,253,0,1]),Buffer.from('hello')]){
   for(const value of [bytes.toString('base64'),bytes.toString('base64url')]){ctx.encoded=value;expect(vm.runInContext('decodeGmailData_(encoded)',ctx)).toEqual(Array.from(bytes));}
  }
 });
});
