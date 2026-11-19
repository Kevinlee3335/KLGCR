// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect,it } from 'vitest';
it('resolves username-only Auth identities while preserving existing users and rejecting disabled accounts',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id int primary key,email text);
 create table public.profiles(id int primary key,email text not null,username text,is_active boolean default true,deleted_at timestamptz);
 insert into auth.users values(1,'existing@example.com'),(2,'random@users.klgcr.invalid');
 insert into profiles values(1,'existing@example.com','existing',true,null);`);
 await db.exec(readFileSync('supabase/migrations/20261119153000_optional_user_email.sql','utf8'));
 await db.exec("insert into profiles values(2,null,'klgscc',true,null);set role anon;");
 expect((await db.query("select public.login_email_for_username(' KLGSCC ') as email")).rows).toEqual([{email:'random@users.klgcr.invalid'}]);
 expect((await db.query("select public.login_email_for_username('existing') as email")).rows).toEqual([{email:'existing@example.com'}]);
 await db.exec("reset role;update profiles set is_active=false where id=2;set role anon;");
 expect((await db.query("select public.login_email_for_username('klgscc') as email")).rows).toEqual([{email:null}]);
 } finally {await db.close();}
},30000);
