// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';
const db = new PGlite();
beforeAll(async () => {
 await db.exec(`create role anon; create role authenticated;
 create table blocks(id int, code text); insert into blocks values(1,'A'),(2,'C');
 create table complaints(id int,status text,assigned_at timestamptz,submitted_at timestamptz,block_id int);
 create table maintenance_jobs(id int,complaint_id int,status text,assigned_at timestamptz);
 create table report_snapshots(id serial,report_type text,report_date date,block_group text,payload jsonb,whatsapp_text text);
 insert into complaints select i,'assigned',case when i<=8 then now() end,'2026-10-15 08:00+08',1 from generate_series(1,10) i;
 insert into maintenance_jobs select i,i,case when i<=6 then 'completed' when i=7 then 'under_monitoring' else 'pending_material' end,now() from generate_series(1,8) i;
 insert into complaints values(11,'new',null,'2026-10-14 15:59:59.999+00',1),(12,'new',null,'2026-10-15 16:00+00',1),(13,'new',null,'2026-10-15 08:00+08',2);`);
 await db.exec(readFileSync('supabase/migrations/20261015065813_today_complaint_intake_tracking.sql','utf8'));
},30000);
afterAll(async()=>{await db.close()});
it('counts the received cohort by MYT day; dispatched includes finished jobs',async()=>{
 const {rows}=await db.query<{s:Record<string,number>}>("select complaint_intake_summary('2026-10-15','AB') s");
 expect(rows[0].s).toMatchObject({total:10,dispatched:8,completed:6,under_monitoring:1,pending_material:1,unassigned:2});
 const all=await db.query<{s:Record<string,number>}>("select complaint_intake_summary('2026-10-15','ALL') s");expect(all.rows[0].s.total).toBe(11);
});
it('captures both scheduled times and manual reports, leaving previous snapshots unchanged',async()=>{
 for(const type of ['morning_tasks','daily_summary'])await db.query("insert into report_snapshots(report_type,report_date,block_group,payload,whatsapp_text) values($1,'2026-10-15','AB','{}','Existing report')",[type]);
 await db.exec("update maintenance_jobs set status='completed' where id=8;");
 const {rows}=await db.query<{payload:{complaint_intake:{total:number;completed:number}};whatsapp_text:string}>("select payload,whatsapp_text from report_snapshots order by id");
 expect(rows).toHaveLength(2);for(const r of rows){expect(r.payload.complaint_intake).toMatchObject({total:10,completed:6});expect(r.whatsapp_text).toContain('Complaints received today: 10');expect(r.whatsapp_text).toContain('Existing report');}
 const live=await db.query<{s:{total:number;completed:number}}>("select complaint_intake_summary('2026-10-15','AB') s");expect(live.rows[0].s).toMatchObject({total:10,completed:7});
 await db.exec("insert into report_snapshots(report_type,report_date,block_group,payload,whatsapp_text) values('inventory_report','2026-10-15','ALL','{}','Inventory');");
 expect((await db.query<{whatsapp_text:string}>("select whatsapp_text from report_snapshots where report_type='inventory_report'")).rows[0].whatsapp_text).toBe('Inventory');
});
it('keeps totals reconciled for rejected and cancelled complaints',async()=>{
 await db.exec("update complaints set status='rejected' where id=9; update maintenance_jobs set status='cancelled' where id=7;");
 const s=(await db.query<{s:Record<string,number>}>("select complaint_intake_summary('2026-10-15','AB') s")).rows[0].s;
 expect(s.total).toBe(10);expect(s.rejected).toBe(1);expect(s.cancelled).toBe(1);
 expect(['completed','under_monitoring','pending_material','in_progress','assigned','unassigned','rejected','cancelled'].reduce((n,k)=>n+s[k],0)).toBe(s.total);
});
it('obeys row visibility and denies anonymous RPC execution',async()=>{
 await db.exec("alter table complaints enable row level security; create policy own_block on complaints for select to authenticated using(block_id=2); grant select on complaints,maintenance_jobs,blocks to authenticated; set role authenticated;");
 expect((await db.query<{s:{total:number}}>("select complaint_intake_summary('2026-10-15','ALL') s")).rows[0].s.total).toBe(1);
 await db.exec('reset role; set role anon;');await expect(db.query("select complaint_intake_summary('2026-10-15','ALL')")).rejects.toThrow(/permission denied/);await db.exec('reset role;');
});
