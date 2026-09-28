// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from "vitest";

// Real PostgreSQL execution in an isolated in-memory database. Only auth and cron
// infrastructure are supplied by this harness; application SQL runs unchanged.
const db = new PGlite();
const admin="00000000-0000-4000-8000-000000000001", staff="00000000-0000-4000-8000-000000000002", next="00000000-0000-4000-8000-000000000003";
const complaint="00000000-0000-4000-8000-000000000011", job="00000000-0000-4000-8000-000000000012", item="00000000-0000-4000-8000-000000000013";
async function asUser(id:string){await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec("set role authenticated");}
const sql=(name:string)=>readFileSync(`supabase/migrations/${name}.sql`,"utf8");

beforeAll(async()=>{
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema cron;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated; grant execute on function auth.uid() to authenticated;
    create table cron.job(jobid bigint generated always as identity,jobname text unique,schedule text,command text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) on conflict(jobname) do update set schedule=$2,command=$3 returning jobid$$;
    create function cron.unschedule(bigint) returns boolean language sql as $$delete from cron.job where jobid=$1 returning true$$;`);
  for(const name of ["202608240001_phase1_foundation","202608260001_phase2_complaints_jobs","202608270001_phase3_staff_job_workflow","202609010001_phase4_material_inventory","202609020001_phase5_reporting_automation","202609020004_phase5_work_states_admin_tasks","202609020003_phase5_overall_daily_summary"]){
    await db.exec(sql(name).replace(/^create extension.*;$/gm,""));
  }
  await db.exec(`create table public.appointments(id uuid primary key default gen_random_uuid(),job_id uuid references public.maintenance_jobs(id),assigned_staff uuid references public.profiles(id),status text);
    alter table public.appointments enable row level security;
    create policy appointments_read on public.appointments for select to authenticated using(public.is_admin() or assigned_staff=auth.uid());
    create policy appointments_update on public.appointments for update to authenticated using(public.is_admin()) with check(public.is_admin());
    grant select,update on public.appointments to authenticated;
    grant usage,select on all sequences in schema public to authenticated;
    create policy complaints_delete on public.complaints for delete to authenticated using(public.is_admin());
    grant delete on public.complaints to authenticated;`);
  await db.exec(sql("20260928070041_september_review_batch"));
  await db.query("insert into auth.users(id,email) values($1,'admin@example.test'),($2,'worker@example.test'),($3,'other@example.test')",[admin,staff,next]);
  await db.query("update public.profiles set role='admin',full_name='Admin' where id=$1",[admin]);
  await db.query("update public.profiles set full_name='Abdullah' where id=$1",[staff]);
  await db.query("update public.profiles set full_name='Faiz' where id=$1",[next]);
  await db.query("insert into public.profile_blocks(profile_id,block_id) values($1,1),($2,1)",[staff,next]);
  await db.query("insert into public.complaints(id,source,block_id,room_no,category,description) values($1,'manual',1,'A101','Electrical','Original reporter text')",[complaint]);
  await db.query("insert into public.maintenance_jobs(id,complaint_id,block_id,room_no,category,description,priority,assigned_to,status,started_at) values($1,$2,1,'A101','Electrical','Admin confirmed: light not working','normal',$3,'in_progress',now())",[job,complaint,staff]);
  await db.query("insert into public.inventory_items(id,item_code,description,category,balance_qty,unit) values($1,'KLGCR-E00001','Lamp','Electrical',3,'pcs')",[item]);
},30000);
afterAll(async()=>{await db.close();});
beforeEach(async()=>{await db.exec("begin");});
afterEach(async()=>{await db.exec("rollback;reset role");});

describe("September review database flows",()=>{
  it("transfers ownership and appointments atomically, preserving progress and history",async()=>{
    await db.query("insert into appointments(job_id,assigned_staff,status) values($1,$2,'confirmed')",[job,staff]);
    await asUser(admin);
    await db.query("select transfer_maintenance_job($1,$2,'Workload assistance')",[job,next]);
    expect((await db.query("select assigned_to,status,started_at from maintenance_jobs where id=$1",[job])).rows[0]).toMatchObject({assigned_to:next,status:"in_progress"});
    expect((await db.query("select assigned_staff from appointments")).rows[0]).toMatchObject({assigned_staff:next});
    expect((await db.query("select previous_staff,assigned_staff,reason from job_assignment_history")).rows[0]).toMatchObject({previous_staff:staff,assigned_staff:next,reason:"Workload assistance"});
    await asUser(staff);expect((await db.query("select id from maintenance_jobs")).rows).toHaveLength(0);
    await asUser(next);expect((await db.query("select id from maintenance_jobs")).rows).toHaveLength(1);
  });
  it("creates an Other request, shows its name, then issues matched stock exactly once",async()=>{
    await asUser(staff);
    const result=await db.query<{id:string}>("select create_material_request($1,'Need replacement',$2::jsonb) as id",[job,JSON.stringify([{other_item_name:"Special lamp",qty:1}])]);
    const request=result.rows[0].id;
    const requested=(await db.query<{id:string;other_item_name:string}>("select id,other_item_name from material_request_items where request_id=$1",[request])).rows[0];
    expect(requested.other_item_name).toBe("Special lamp");
    await asUser(admin);
    await db.query("select review_material_request($1,true,null)",[request]);
    await db.exec("savepoint before_issue");
    await expect(db.query("select issue_material_request($1)",[request])).rejects.toThrow();
    await db.exec("rollback to savepoint before_issue");
    expect((await db.query("select balance_qty from inventory_items")).rows[0]).toMatchObject({balance_qty:"3.00"});
    await db.query("select match_other_material($1,$2,$3)",[request,requested.id,item]);
    await db.query("select issue_material_request($1)",[request]);
    expect((await db.query("select balance_qty from inventory_items")).rows[0]).toMatchObject({balance_qty:"2.00"});
    await db.exec("savepoint double_issue");
    await expect(db.query("select issue_material_request($1)",[request])).rejects.toThrow();
    await db.exec("rollback to savepoint double_issue");
    expect((await db.query("select count(*)::int n from inventory_issue_history")).rows[0]).toMatchObject({n:1});
  });
  it("generates weekly/monthly tasks once and limits staff to their own task status",async()=>{
    await asUser(admin);
    await db.query("insert into recurring_daily_tasks(title,assigned_to,created_by,frequency,day_number,starts_on) values('Stairs',$1,$2,'weekly',6,'2026-09-01'),('Meter',$1,$2,'monthly',31,'2026-09-01')",[staff,admin]);
    await db.query("select materialize_recurring_tasks('2026-09-26')");await db.query("select materialize_recurring_tasks('2026-09-26')");
    await db.query("select materialize_recurring_tasks('2026-09-30')");
    expect((await db.query("select count(*)::int n from admin_daily_tasks")).rows[0]).toMatchObject({n:2});
    await asUser(next);expect((await db.query("select id from admin_daily_tasks")).rows).toHaveLength(0);
    await asUser(staff);const tasks=await db.query<{id:number}>("select id from admin_daily_tasks");
    await db.query("select update_assigned_daily_task($1,'completed')",[tasks.rows[0].id]);
    expect((await db.query("select status from admin_daily_tasks where id=$1",[tasks.rows[0].id])).rows[0]).toMatchObject({status:"completed"});
  });
  it("formats automatic reports with real newlines, confirmed defects and requested items",async()=>{
    await asUser(staff);await db.query("select create_material_request($1,'',$2::jsonb)",[job,JSON.stringify([{inventory_item_id:item,qty:1},{other_item_name:"Connector",qty:2}])]);
    await db.exec("reset role");await db.query("select generate_automatic_report('daily_summary')");
    const report=(await db.query<{whatsapp_text:string}>("select whatsapp_text from report_snapshots where block_group='AB' and report_type='daily_summary'")).rows[0].whatsapp_text;
    expect(report).toContain("🔧 Electrical — Admin confirmed: light not working");
    expect(report).toContain("📦 KLGCR-E00001 Lamp | 1.00 pcs");expect(report).toContain("Connector | 2.00");
    expect(report).toContain("\n\n🔴 PENDING MATERIAL\n");expect(report).not.toContain("\\n");
    expect(report).toContain("CARRY FORWARD TO NEXT DAY: 1 JOBS");
    expect((await db.query("select schedule from cron.job where jobname='klgcr-phase5-morning'")).rows[0]).toMatchObject({schedule:"30 1 * * *"});
  });
  it("archives deleted complaints for management without exposing them to staff",async()=>{
    await asUser(admin);
    const record=await db.query<{id:string}>("insert into complaints(source,block_id,room_no,category,description,status) values('manual',1,'A202','Bathroom','Rejected defect','rejected') returning id");
    await db.query("delete from complaints where id=$1",[record.rows[0].id]);
    expect((await db.query("select description,deleted_by from deleted_complaints")).rows[0]).toMatchObject({description:"Rejected defect",deleted_by:admin});
    await asUser(staff);expect((await db.query("select id from deleted_complaints")).rows).toHaveLength(0);
  });
});
