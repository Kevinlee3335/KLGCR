// @vitest-environment node
import { expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { getCheckoutDashboardCounts, type CheckoutStatusReport } from '@/components/checkout-status-dashboard';

it('reports five reopened repairs and two cleaning reworks using the current round', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table blocks(id int primary key,code text);
      create table profiles(id int primary key,full_name text);
      create table checkout_rooms(id text primary key,reference_no text,room_no text,block_id int,status text,assigned_to int,cleaner_id int,created_at timestamptz,ready_at timestamptz,deleted_at timestamptz);
      create table checkout_defects(checkout_room_id text,description text,status text,rectified_at timestamptz);
      create table checkout_history(checkout_room_id text,action text,created_at timestamptz);
      create table material_requests(checkout_room_id text,status text);
      insert into blocks values(1,'A');
      insert into profiles values(1,'Abdullah'),(2,'Ariffin');
      insert into checkout_rooms
      select room,room,room,1,case when room in ('228','401') then 'cleaning' else 'rectification' end,
        1,case when room in ('228','401') then 2 else null end,'2026-11-05 00:00Z',null,null
      from unnest(array['321','429','428','207','245','228','401']) as r(room);
      insert into checkout_history select id,'cleaning_completed','2026-11-10 04:00Z' from checkout_rooms;
      insert into checkout_history select id,'cleaning_completed','2026-11-21 00:00Z' from checkout_rooms where status='cleaning';
      insert into checkout_history select id,'handed_to_housekeeping','2026-11-21 04:50Z' from checkout_rooms where status='cleaning';
      insert into checkout_defects select id,'Previous repair','rectified','2026-11-09 04:00Z' from checkout_rooms;
      insert into checkout_defects select id,'New repair','open',null from checkout_rooms where status='rectification';
    `);
    await db.exec(readFileSync('supabase/migrations/20261121050509_checkout_reopened_cleaning_report.sql','utf8'));
    const report = async () => (await db.query<{report: CheckoutStatusReport}>("select checkout_status_report('2026-11-21','ALL') report")).rows[0].report;
    const current = await report();
    expect(current.total).toBe(7);
    expect(current.cleaner_in_progress).toBe(2);
    expect(current.cleaner_completed).toBe(0);
    expect(current.cleaner_today).toBe(0);
    expect(current.rooms.filter(r => r.maintenance_status==='In Progress')).toHaveLength(5);
    expect(current.rooms.every(r => r.cleaned_at === null)).toBe(true);
    const sources = current.rooms.map(r => ({id:r.id,defect_count:2,can_assign_cleaner:false}));
    const counts = getCheckoutDashboardCounts(current,sources);
    expect(counts.cleaningActive).toBe(2);
    expect(counts.cleaningCompleted).toBe(0);
    expect([...counts.cleaners.values()]).toEqual([{name:'Ariffin',total:2,completed:0,today:0,active:2,pending:0}]);

    await db.exec("update checkout_rooms set status='verification',cleaner_id=null where id='228'");
    const waiting = (await report()).rooms.find(r => r.id==='228');
    expect(waiting?.cleaner_status).toBe('Not handed to cleaning');
    expect(waiting?.cleaned_at).toBe(null);

    await db.exec(`
      update checkout_rooms set status='ready_for_occupancy',cleaner_id=2,ready_at='2026-11-21 05:00Z' where id='401';
      insert into checkout_history values('401','cleaning_completed','2026-11-21 05:00Z');
    `);
    const completed = await report();
    expect(completed.cleaner_completed).toBe(1);
    expect(completed.cleaner_today).toBe(1);
    expect(completed.rooms.find(r => r.id==='401')?.cleaner_status).toBe('Completed');
    expect(new Date(completed.rooms.find(r => r.id==='401')!.cleaned_at!).toISOString()).toBe('2026-11-21T05:00:00.000Z');
    expect((await db.query<{n:number}>("select count(*)::int n from checkout_history where action='cleaning_completed'")).rows[0].n).toBe(10);
  } finally {
    await db.close();
  }
}, 20000);
