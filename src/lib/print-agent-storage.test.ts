// @vitest-environment node
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {it,expect} from 'vitest';
it('protects device credentials, deduplicates periods and fences stale deliveries',async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon; create role authenticated; create role service_role; create table public.profiles(id uuid primary key);");
 await db.exec(readFileSync('docs/PRINT_AGENT_SCHEMA.sql','utf8'));
 await db.exec('set role authenticated');await expect(db.query('select token_hash from klg_print_device')).rejects.toThrow(/permission denied/);await expect(db.query("insert into klg_print_jobs(kind,dedupe_key) values('test','bad')")).rejects.toThrow(/permission denied/);await db.exec('reset role');
 const {rows:[job]}=await db.query<{id:string}>("insert into klg_print_jobs(kind,period,dedupe_key) values('rental','2026-11','rental:2026-11') returning id");
 await expect(db.query("insert into klg_print_jobs(kind,period,dedupe_key) values('rental','2026-11','rental:2026-11')")).rejects.toThrow(/unique/);
 const claim=()=>db.query("update klg_print_jobs set status='claimed',device_hash='abc' where id=$1 and status='queued' and attempt=1 returning id",[job.id]);expect((await claim()).rows).toHaveLength(1);expect((await claim()).rows).toHaveLength(0);
 await db.query("update klg_print_jobs set status='queued',attempt=2 where id=$1",[job.id]);
 expect((await db.query("update klg_print_jobs set status='submitted' where id=$1 and status='claimed' and attempt=1 and device_hash='abc' returning id",[job.id])).rows).toHaveLength(0);
 await expect(db.query("insert into klg_print_jobs(kind,dedupe_key) values('utility','utility:2026-11')")).rejects.toThrow(/check constraint/);
 }finally{await db.close()}
},20000);
