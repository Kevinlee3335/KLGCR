// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { collectionStatus, scheduleDates } from './shared';
const migration = readFileSync('supabase/migrations/20261021072208_waste_collection_schedule.sql','utf8');
describe('waste collection validation', () => {
 it('rejects invalid dates, wrong months and deduplicates dates', () => {
  expect(scheduleDates('2026-10','2, 02, 9\n2026-10-31')).toEqual(['2026-10-02','2026-10-09','2026-10-31']);
  expect(() => scheduleDates('2026-02','30')).toThrow();
  expect(() => scheduleDates('2026-10','2026-11-01')).toThrow();
 });
 it('uses Malaysia deadlines and does not mark Friday unfinished before the deadline', () => {
  expect(collectionStatus('2026-10-23',null,null,new Date('2026-10-23T08:50:00Z'))).toBe('Scheduled');
  expect(collectionStatus('2026-10-23',null,null,new Date('2026-10-23T16:00:00Z'))).toMatch(/^No record/);
  expect(collectionStatus('2026-10-23','12:00:00','2026-10-23T05:00:00Z')).toBe('Delayed');
 });
});
describe('waste database workflow', () => {
 it('saves schedules atomically, locks down evidence, audits reviews, and appends Friday exceptions', async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
   create table public.profiles(id uuid primary key);
   insert into public.profiles values('00000000-0000-0000-0000-000000000001');
   create function public.is_admin() returns boolean language sql as $$ select current_setting('app.role',true)='admin' $$;
   create function public.is_management() returns boolean language sql as $$ select current_setting('app.role',true) in ('admin','viewer') $$;
   create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit int,allowed_mime_types text[]);
   create table public.report_snapshots(id uuid default gen_random_uuid(),report_type text,report_date date,payload jsonb,whatsapp_text text);
   grant usage on schema public,auth to authenticated;
   grant insert,select on public.report_snapshots to authenticated; set app.role='admin';`);
  await db.exec(migration);
  await db.exec("create trigger waste_friday_report before insert on public.report_snapshots for each row execute function public.append_waste_friday_report();");
  await db.exec(`set role authenticated; select public.save_waste_schedule('2026-10-01',array['2026-10-19','2026-10-20','2026-10-21','2026-10-23']::date[],null,null,null); reset role;`);
  expect((await db.query('select * from waste_schedule_dates')).rows).toHaveLength(4);
  await expect(db.exec(`set role authenticated; select public.save_waste_schedule('2026-10-01',array['2026-11-01']::date[],null,null,null);`)).rejects.toThrow('Invalid schedule');
  await db.exec(`reset role; insert into waste_security_links(id,guard_name,token_hash,created_by) values('00000000-0000-0000-0000-000000000002','Guard',repeat('a',64),auth.uid());
   insert into waste_collections(id,schedule_id,security_link_id,guard_name,collected_at,bins,photos,created_at)
   select gen_random_uuid(),id,'00000000-0000-0000-0000-000000000002','Guard',case when collection_date='2026-10-19' then '2026-10-19T10:00:00+08:00'::timestamptz else '2026-10-22T10:00:00+08:00'::timestamptz end,3,array['photo.jpg'],'2026-10-22T10:00:00+08:00'::timestamptz from waste_schedule_dates where collection_date in ('2026-10-19','2026-10-21');
   update waste_schedule_dates set review_status='confirmed_missed',review_note='Confirmed with guard',reviewed_by=auth.uid() where collection_date='2026-10-20';`);
  expect((await db.query('select * from waste_schedule_reviews')).rows).toHaveLength(1);
  const report = (await db.query<{text:string}>(`select waste_collection_report_text('2026-10-23','2026-10-23T16:50:00+08:00') as text`)).rows[0].text;
  expect(report).toContain('2026-10-19 | COMPLETED');
  expect(report).toContain('2026-10-21 | DELAYED');
  expect(report).toContain('2026-10-20 | NO RECORD');
  expect(report).toContain('Confirmed with guard');
  expect(report).toContain('2026-10-23 | SCHEDULED');
  await db.exec(`set role authenticated; set app.role='staff';`);
  expect((await db.query('select * from waste_collections')).rows).toHaveLength(0);
  await expect(db.query('select * from waste_security_links')).rejects.toThrow('permission denied');
  await expect(db.exec('delete from waste_collections')).rejects.toThrow('permission denied');
  await expect(db.exec(`select save_waste_schedule('2026-10-01',array['2026-10-24']::date[],null,null,null)`)).rejects.toThrow('Administrator access required');
  await db.exec(`set app.role='admin'; insert into report_snapshots(report_type,report_date,whatsapp_text) values('daily_summary','2026-10-23','Original report'),('daily_summary','2026-10-22','Thursday report'); reset role;`);
  const snapshots = (await db.query<{whatsapp_text:string}>('select whatsapp_text from report_snapshots order by report_date desc')).rows;
  expect(snapshots[0].whatsapp_text).toContain('Original report\n\nCLEANTECH');
  expect(snapshots[1].whatsapp_text).toBe('Thursday report');
  expect((await db.query<{public:boolean}>('select public from storage.buckets')).rows[0].public).toBe(false);
  await db.close();
 }, 30000);
});
