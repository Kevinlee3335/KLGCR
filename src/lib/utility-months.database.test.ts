// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';

it('archives each revision, rolls without an invoice, preserves new uploads and never invents missing readings',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create function public.current_role() returns text language sql as $$select current_setting('app.role',true)$$;
 create table billing_preview_settings(id integer primary key,config jsonb,revision integer,updated_at timestamptz);
 insert into billing_preview_settings values(1,'{"utilityPeriod":"2026-10","utilityAccounts":[{"id":"a","meters":[
 {"id":"normal","prev":10,"curr":20,"photo":"oct","currentDate":"2026-10-01","confirmed":true},
 {"id":"nov","prev":30,"curr":null,"previousPhoto":"oct-recovered","previousDate":"2026-10-01","photo":"nov","currentDate":"2026-11-02","confirmed":false},
 {"id":"missing","prev":5,"curr":null,"previousPhoto":"sep","previousDate":"2026-09-01","photo":"nov2","currentDate":"2026-11-02","confirmed":false}
 ]}]}',1,now());`);
 await db.exec(readFileSync('supabase/migrations/20261102065115_utility_monthly_reading_archive.sql','utf8'));
 // Freeze the database function's target month so the test remains valid next year.
 const definition=(await db.query<{def:string}>("select pg_get_functiondef('ensure_utility_month()'::regprocedure) def")).rows[0].def;

 // pg_get_functiondef preserves the original body text.
 await db.exec(definition.replace("to_char(now() at time zone 'Asia/Kuala_Lumpur','YYYY-MM')","'2026-11'"));
 await db.exec('select ensure_utility_month()');
 const config=(await db.query<{config:{utilityPeriod:string;utilityAccounts:{meters:Record<string,unknown>[]}[]}}>('select config from billing_preview_settings')).rows[0].config;
 expect(config.utilityPeriod).toBe('2026-11');
 const [normal,nov,missing]=config.utilityAccounts[0].meters;
 expect(normal).toMatchObject({prev:20,curr:null,previousPhoto:'oct',confirmed:false});expect(normal.photo).toBeUndefined();
 expect(nov).toMatchObject({prev:30,previousPhoto:'oct-recovered',photo:'nov',curr:null});
 expect(missing).toMatchObject({prev:null,photo:'nov2'});expect(missing.previousPhoto).toBeUndefined();
 const oct=(await db.query<{config:typeof config}>("select config from utility_reading_months where period='2026-10'")).rows[0].config;
 expect(oct.utilityAccounts[0].meters[1]).toMatchObject({photo:'oct-recovered',curr:30,prev:null});
 expect(oct.utilityAccounts[0].meters[2].photo).toBeUndefined();
 expect((await db.query('select * from utility_reading_revisions')).rows).toHaveLength(2);
 await db.exec('select ensure_utility_month()');expect((await db.query<{revision:number}>('select revision from billing_preview_settings')).rows[0].revision).toBe(2);
 await db.exec("update billing_preview_settings set revision=3,config=jsonb_set(config,'{utilityAccounts,0,meters,0,photo}','\"replacement\"')");
 expect((await db.query('select * from utility_reading_revisions')).rows).toHaveLength(3);
 await expect(db.exec("update billing_preview_settings set config=jsonb_set(config,'{utilityPeriod}','\"2026-10\"')")).rejects.toThrow(/backwards/);
 await db.exec("set role authenticated;set app.role='admin'");expect((await db.query('select period from utility_reading_months')).rows).toHaveLength(2);
 await db.exec("set app.role='maintenance_staff'");expect((await db.query('select period from utility_reading_months')).rows).toHaveLength(0);
 await expect(db.exec('select ensure_utility_month()')).rejects.toThrow(/permission denied/);
 await expect(db.exec('select * from utility_reading_revisions')).rejects.toThrow(/permission denied/);
 }finally{await db.close()}
});
