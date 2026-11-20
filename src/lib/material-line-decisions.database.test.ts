// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
    create function is_admin() returns boolean language sql as $$select auth.uid()='${id(1)}'::uuid$$;
    create function is_management() returns boolean language sql as $$select auth.uid() in ('${id(1)}'::uuid,'${id(3)}'::uuid)$$;
    create table profiles(id uuid primary key); insert into profiles values('${id(1)}'),('${id(2)}'),('${id(3)}');
    create type material_request_status as enum('pending','approved','rejected','issued');
    create table material_requests(id uuid primary key,job_id uuid,checkout_room_id uuid,requested_by uuid,status material_request_status default 'pending',reviewed_by uuid,reviewed_at timestamptz,rejection_reason text,issued_by uuid,issued_at timestamptz);
    create table inventory_items(id uuid primary key,item_code text,description text,unit text,balance_qty numeric,is_active boolean default true);
    create table material_request_items(id uuid primary key,request_id uuid,inventory_item_id uuid,other_item_name text,requested_qty numeric,approved_qty numeric,issued_qty numeric,unique(request_id,inventory_item_id));
    create table inventory_issue_history(request_id uuid,job_id uuid,checkout_room_id uuid,inventory_item_id uuid,staff_id uuid,qty numeric,balance_before numeric,balance_after numeric,issued_by uuid);
    grant usage on schema public,auth to authenticated,anon;
    grant select on profiles,material_requests,material_request_items,inventory_items,inventory_issue_history to authenticated;
    set app.uid='${id(1)}';`);
  await db.exec(readFileSync("supabase/migrations/20261029041959_material_request_item_approval.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261120073521_material_request_line_decisions.sql","utf8"));
  await db.exec(`insert into material_requests(id,checkout_room_id,requested_by) values('${id(10)}','${id(90)}','${id(2)}');
    insert into inventory_items(id,item_code,description,unit,balance_qty) values
    ('${id(20)}','PVC20','PVC Joint 20mm','pcs',9),('${id(21)}','TILE','Tiles','pcs',6),('${id(22)}','CEMENT','Cement','kg',5),('${id(23)}','PVC15','PVC Joint 15mm','pcs',12);
    insert into material_request_items(id,request_id,inventory_item_id,requested_qty) values
    ('${id(30)}','${id(10)}','${id(20)}',1),('${id(31)}','${id(10)}','${id(21)}',2),('${id(32)}','${id(10)}','${id(22)}',0.5);
    set role authenticated;`);
},20000);
afterEach(async () => { await db?.close(); });

const approve = (line: number) => db.query("select approve_material_request_item($1,$2)",[id(10),id(line)]);
const issue = (line?: number) => db.query("select issue_material_request_items($1,$2)",[id(10),line ? id(line) : null]);
async function amend(line: number, action: string, opts: { reason?: string; inventory?: number; qty?: number; expectedQty?: number; expectedApproved?: number | null; request?: number } = {}) {
  const current = (await db.query<{inventory_item_id:string;requested_qty:string;approved_qty:string|null}>("select * from material_request_items where id=$1",[id(line)])).rows[0];
  return db.query("select amend_material_request_item($1,$2,$3,$4,$5,$6,$7,$8,$9)",[
    id(opts.request || 10),id(line),action,opts.reason ?? "Correct size / not required",current.inventory_item_id,opts.expectedQty ?? current.requested_qty,
    "expectedApproved" in opts ? opts.expectedApproved : current.approved_qty,opts.inventory ? id(opts.inventory) : null,opts.qty ?? null,
  ]);
}
const status = async () => (await db.query<{status:string}>("select status from material_requests where id=$1",[id(10)])).rows[0].status;
const balances = async () => (await db.query("select item_code,balance_qty from inventory_items order by item_code")).rows;

it("rejects one pending line in a partially approved request and issues only the remaining materials", async () => {
  await approve(31); await approve(32);
  const stock = await balances();
  await amend(30,"reject");
  expect(await status()).toBe("approved"); expect(await balances()).toEqual(stock);
  await expect(approve(30)).rejects.toThrow("Pending material item not found");
  await issue(); expect(await status()).toBe("issued");
  const rows = (await db.query<{inventory_item_id:string}>("select inventory_item_id from inventory_issue_history")).rows;
  expect(rows.map(row=>row.inventory_item_id).sort()).toEqual([id(21),id(22)]);
  expect((await db.query("select balance_qty from inventory_items where id=$1",[id(20)])).rows[0]).toEqual({balance_qty:"9"});
});

it("cancels an approved item without deducting stock, preserving the original approval in its audit", async () => {
  await approve(30); await approve(31); await approve(32);
  const stock = await balances();
  await amend(30,"cancel"); expect(await balances()).toEqual(stock);
  await expect(issue(30)).rejects.toThrow("No approved materials");
  await issue(); expect(await status()).toBe("issued");
  const event = (await db.query<{action:string;old_values:{approved_qty:number};new_values:{line_status:string};actor_id:string}>("select * from material_request_item_history")).rows[0];
  expect(event.action).toBe("cancel"); expect(event.old_values.approved_qty).toBe(1); expect(event.new_values.line_status).toBe("cancelled"); expect(event.actor_id).toBe(id(1));
});

it("changes 20mm to 15mm, resets approval, then deducts only the actual 15mm item on issue", async () => {
  await approve(30); const stock = await balances();
  await amend(30,"edit",{inventory:23,qty:2});
  expect(await balances()).toEqual(stock); expect(await status()).toBe("pending");
  const row = (await db.query("select inventory_item_id,requested_qty,approved_qty,approved_by,approved_at from material_request_items where id=$1",[id(30)])).rows[0];
  expect(row).toEqual({inventory_item_id:id(23),requested_qty:"2",approved_qty:null,approved_by:null,approved_at:null});
  await expect(issue(30)).rejects.toThrow("No approved materials");
  await approve(30); await issue(30);
  expect((await db.query("select item_code,balance_qty from inventory_items where item_code like 'PVC%' order by item_code")).rows).toEqual([{item_code:"PVC15",balance_qty:"10"},{item_code:"PVC20",balance_qty:"9"}]);
  const event = (await db.query<{old_values:{description:string};new_values:{description:string}}>("select * from material_request_item_history")).rows[0];
  expect(event.old_values.description).toBe("PVC Joint 20mm"); expect(event.new_values.description).toBe("PVC Joint 15mm");
});

it("closes a request when all its unissued items are cancelled or rejected", async () => {
  await approve(30); await amend(30,"cancel"); await amend(31,"reject"); await amend(32,"reject");
  expect(await status()).toBe("rejected");
  expect((await db.query("select * from inventory_issue_history")).rows).toHaveLength(0);
});

it("never reopens a cancelled line during whole-request approval", async () => {
  await approve(30); await amend(30,"cancel");
  await db.query("select review_material_request($1,true,null)",[id(10)]);
  expect(await status()).toBe("approved");
  await issue();
  expect((await db.query("select line_status from material_request_items where id=$1",[id(30)])).rows[0]).toEqual({line_status:"cancelled"});
  expect((await db.query("select balance_qty from inventory_items where id=$1",[id(20)])).rows[0]).toEqual({balance_qty:"9"});
});

it("keeps an issued sibling intact when the remaining pending item is rejected", async () => {
  await approve(31); await issue(31); await amend(30,"reject"); await amend(32,"reject");
  expect(await status()).toBe("issued");
  expect((await db.query("select * from inventory_issue_history")).rows).toHaveLength(1);
  await expect(amend(31,"edit",{inventory:23,qty:1})).rejects.toThrow("Open material request not found");
});

it("blocks already issued lines, stale edits, invalid quantities, duplicates and unauthorized callers", async () => {
  await expect(amend(30,"edit",{inventory:23,qty:0})).rejects.toThrow("positive quantity");
  await expect(amend(30,"edit",{inventory:23,qty:0.001})).rejects.toThrow("positive quantity");
  await expect(amend(30,"edit",{inventory:21,qty:1})).rejects.toThrow("already exists");
  await expect(amend(30,"reject",{reason:" "})).rejects.toThrow("Enter a reason");
  await expect(amend(30,"reject",{expectedQty:5})).rejects.toThrow("has changed");
  await expect(amend(30,"reject",{request:99})).rejects.toThrow("Open material request");
  await approve(30);
  await expect(amend(30,"cancel",{expectedApproved:null})).rejects.toThrow("has changed");
  await expect(amend(30,"reject")).rejects.toThrow("Use Cancel Approval");
  await issue(30);
  await expect(amend(30,"cancel")).rejects.toThrow("Issued items cannot");
  await expect(amend(30,"edit",{inventory:23,qty:1})).rejects.toThrow("Issued items cannot");
  for (const uid of [id(2),id(3),""]) {
    await db.exec(`set app.uid='${uid}'`);
    await expect(amend(31,"reject")).rejects.toThrow("Administrator access");
  }
});

it("protects audit history from direct writes and rolls back the decision if auditing fails", async () => {
  await expect(db.exec("delete from material_request_item_history")).rejects.toThrow("permission denied");
  await expect(db.query("select refresh_material_request_status($1)",[id(10)])).rejects.toThrow("permission denied");
  await db.exec("reset role;alter table material_request_item_history add constraint audit_failure check(false) not valid;set role authenticated");
  await expect(amend(30,"reject")).rejects.toThrow("audit_failure");
  expect((await db.query("select line_status from material_request_items where id=$1",[id(30)])).rows[0]).toEqual({line_status:"active"});
  expect(await status()).toBe("pending");
});

it("allows staff to read only their own decision history", async () => {
  await amend(30,"reject");
  await db.exec(`set app.uid='${id(2)}'`); expect((await db.query("select id from material_request_item_history")).rows).toHaveLength(1);
  await db.exec(`set app.uid='${id(4)}'`); expect((await db.query("select id from material_request_item_history")).rows).toHaveLength(0);
  await db.exec(`set app.uid='${id(3)}'`); expect((await db.query("select id from material_request_item_history")).rows).toHaveLength(1);
});
