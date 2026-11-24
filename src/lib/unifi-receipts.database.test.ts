// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps receipt archives private, unique and tied to a real invoice',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table profiles(id uuid primary key,role text,is_active boolean,deleted_at timestamptz);
      create table unifi_invoices(id uuid primary key,period text default '2026-11',due_date date,account_number text);
      create table app_notifications(id uuid primary key,recipient_id uuid,type text,title text,body text,href text,entity_id uuid,read_at timestamptz);
      create table unifi_webmail_connection(id boolean primary key);
      insert into unifi_invoices(id,due_date) values('11111111-1111-4111-8111-111111111111',(now() at time zone 'Asia/Kuala_Lumpur')::date+7),
        ('22222222-2222-4222-8222-222222222222',(now() at time zone 'Asia/Kuala_Lumpur')::date+8);
      insert into profiles values('33333333-3333-4333-8333-333333333333','admin',true,null),('44444444-4444-4444-8444-444444444444','management_viewer',true,null);
      grant select on profiles,unifi_invoices to service_role;grant select,insert,update on app_notifications to service_role;`);
    await db.exec(readFileSync('supabase/migrations/20261124081715_unifi_payment_receipts.sql','utf8'));
    expect((await db.query("select public from storage.buckets where id='unifi-payment-receipts'")).rows).toEqual([{public:false}]);
    await db.exec('set role authenticated');
    await expect(db.query('select * from unifi_payment_receipts')).rejects.toThrow('permission denied');
    await db.exec('reset role;set role service_role');
    expect((await db.query('select queue_unifi_payment_checks() as count')).rows).toEqual([{count:1}]);
    expect((await db.query('select queue_unifi_payment_checks() as count')).rows).toEqual([{count:0}]);
    const insert=(message:string,hash:string)=>db.query(`insert into unifi_payment_receipts(source_message_id,source_folder,sender,subject,received_at,body_text,content_hash,email_path)
      values($1,'Junk','noreply@unifi.com.my','Payment receipt',now(),'Receipt body',$2,'receipt.eml') returning id`,[message,hash.repeat(64)]);
    const row=(await insert('message-1','a')).rows[0];
    await expect(insert('message-1','b')).rejects.toThrow('unique');
    await expect(insert('message-2','a')).rejects.toThrow('unique');
    await expect(db.query("update unifi_payment_receipts set invoice_id='99999999-9999-4999-8999-999999999999',match_method='manual',matched_at=now() where id=$1",[row.id])).rejects.toThrow('foreign key');
    await db.query("update unifi_payment_receipts set invoice_id='11111111-1111-4111-8111-111111111111',match_method='auto',matched_at=now() where id=$1",[row.id]);
    expect((await db.query('select invoice_id,source_folder from unifi_payment_receipts')).rows).toEqual([{invoice_id:'11111111-1111-4111-8111-111111111111',source_folder:'Junk'}]);
    await db.query('select queue_unifi_payment_checks()');
    expect((await db.query('select read_at is not null as handled from app_notifications')).rows).toEqual([{handled:true}]);
  } finally {await db.close();}
},20000);
