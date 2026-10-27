// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { describe,it,expect } from 'vitest';
describe('supplier archive access boundaries',()=>{
 it('keeps emails/PDFs private to management and read flags private per user',async()=>{
  const db=new PGlite();
  try{
   await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema storage;
   create table public.profiles(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function public.is_management() returns boolean language sql stable as $$select coalesce(current_setting('test.management',true)='true',false)$$;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key,bucket_id text,name text); alter table storage.objects enable row level security;
   grant usage on schema auth,storage to authenticated; grant select on storage.objects to authenticated;`);
   await db.exec(readFileSync('docs/supplier-mail/schema.sql','utf8'));
   await db.exec(`insert into public.profiles values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
   insert into public.supplier_emails(id,company,sender,subject,received_at) values('1234567890abcdef','sigma','customercare.my@sigmamy.com','Service report','2023-01-01T00:00:00+08:00');
   insert into storage.objects values('11111111-1111-4111-8111-111111111111','supplier-mail','sigma/test.pdf');
   set role authenticated; set test.uid='11111111-1111-4111-8111-111111111111'; set test.management='false';`);
   expect((await db.query('select * from public.supplier_emails')).rows).toHaveLength(0);
   expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
   await expect(db.query('select * from public.supplier_mail_connections')).rejects.toThrow();
   await db.exec(`set test.management='true'`);
   expect((await db.query('select * from public.supplier_emails')).rows).toHaveLength(1);
   expect((await db.query('select * from storage.objects')).rows).toHaveLength(1);
   await db.exec(`insert into public.supplier_email_reads(message_id,user_id) values('1234567890abcdef','11111111-1111-4111-8111-111111111111')`);
   await expect(db.exec(`insert into public.supplier_email_reads(message_id,user_id) values('1234567890abcdef','22222222-2222-4222-8222-222222222222')`)).rejects.toThrow();
   await db.exec(`set test.uid='22222222-2222-4222-8222-222222222222'`);
   expect((await db.query('select * from public.supplier_email_reads')).rows).toHaveLength(0);
   await expect(db.exec(`delete from public.supplier_emails`)).rejects.toThrow();
  }finally{await db.close();}
 },20000);
});
