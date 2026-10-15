// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("persists full turns, isolates accounts and denies staff, archived accounts, anonymous and client writes", async () => {
 const db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; create table profiles(id uuid primary key,role text,is_active boolean,deleted_at timestamptz); grant select on profiles to authenticated;
 insert into profiles values('00000000-0000-0000-0000-000000000001','admin',true,null),('00000000-0000-0000-0000-000000000002','management_viewer',true,null),('00000000-0000-0000-0000-000000000003','cleaner',true,null);`);
 await db.exec(readFileSync("docs/AI_ASSISTANT_HISTORY.sql","utf8"));
 await db.exec(`insert into ai_assistant_conversations(id,user_id,title) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Complaint summary'),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Private management chat'); insert into ai_assistant_turns(conversation_id,user_id,question,answer,captured_at) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Which jobs?','JOB-1 needs material','2026-10-15T03:30:00Z');`);
 await expect(db.exec(`insert into ai_assistant_turns(conversation_id,user_id,question,answer,captured_at) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','steal','no',now())`)).rejects.toThrow(/foreign key/);
 await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);`);
 expect((await db.query(`select title from ai_assistant_conversations`)).rows).toEqual([{title:"Complaint summary"}]);
 expect((await db.query(`select question,answer from ai_assistant_turns`)).rows).toEqual([{question:"Which jobs?",answer:"JOB-1 needs material"}]);
 await expect(db.exec(`update ai_assistant_conversations set title='overwrite'`)).rejects.toThrow(/permission denied/);
 await expect(db.exec(`delete from ai_assistant_turns`)).rejects.toThrow(/permission denied/);
 await expect(db.exec(`insert into ai_assistant_conversations(user_id,title) values('00000000-0000-0000-0000-000000000001','fake')`)).rejects.toThrow(/permission denied/);
 await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false)`);
 expect((await db.query(`select title from ai_assistant_conversations`)).rows).toEqual([{title:"Private management chat"}]);
 expect((await db.query(`select * from ai_assistant_turns`)).rows).toHaveLength(0);
 await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false)`);
 expect((await db.query(`select * from ai_assistant_conversations`)).rows).toHaveLength(0);
 await db.exec(`reset role; update profiles set is_active=false where id='00000000-0000-0000-0000-000000000001'; set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);`);
 expect((await db.query(`select * from ai_assistant_turns`)).rows).toHaveLength(0);
 await db.exec(`reset role; set role anon;`);
 await expect(db.query(`select * from ai_assistant_conversations`)).rejects.toThrow(/permission denied/);
 await db.close();
},20000);
