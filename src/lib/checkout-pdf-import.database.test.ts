// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const WORKER = "00000000-0000-4000-8000-000000000002";
const OTHER = "00000000-0000-4000-8000-000000000003";
const VIEWER = "00000000-0000-4000-8000-000000000004";
const IMPORT = "00000000-0000-4000-8000-000000000010";
const PHOTO = "00000000-0000-4000-8000-000000000020";
const PATH = `pdf-import/${ADMIN}/${IMPORT}/${PHOTO}.jpg`;
const migration = readFileSync("supabase/migrations/20261127095849_checkout_pdf_report_import.sql", "utf8");
const fixture = `
create role anon; create role authenticated; create schema auth; create schema storage;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
create table public.profiles(id uuid primary key,role text);
insert into public.profiles values('${ADMIN}','admin'),('${WORKER}','maintenance_staff'),('${OTHER}','maintenance_staff'),('${VIEWER}','management_viewer');
create function public.is_admin() returns boolean language sql as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin')$$;
create function public.is_management() returns boolean language sql as $$select exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','management_viewer'))$$;
create table public.blocks(id integer primary key,code text);
insert into public.blocks values(1,'A'),(2,'B'),(3,'C');
create table public.checkout_batches(id uuid primary key default gen_random_uuid(),state text);
insert into public.checkout_batches(state) values('active');
create table public.checkout_rooms(
 id uuid primary key default gen_random_uuid(),block_id integer references public.blocks(id),room_no text,
 reference_no text default 'TEST',utmspace_defects text,created_by uuid,created_at timestamptz default now(),
 status text default 'second_inspection',assigned_to uuid,cleaner_id uuid,deleted_at timestamptz,
 batch_id uuid default (null),batch_archived_at timestamptz);
create table public.checkout_defects(
 id uuid primary key default gen_random_uuid(),checkout_room_id uuid references public.checkout_rooms(id),
 description text,source text,status text default 'open',created_by uuid);
create table public.checkout_photos(
 id uuid primary key default gen_random_uuid(),checkout_room_id uuid references public.checkout_rooms(id),
 defect_id uuid references public.checkout_defects(id),kind text,storage_path text,uploaded_by uuid);
create table public.checkout_history(
 id bigint generated always as identity primary key,checkout_room_id uuid references public.checkout_rooms(id),
 actor_id uuid,action text,notes text,to_status text);
create table storage.objects(bucket_id text,name text,metadata jsonb,primary key(bucket_id,name));
alter table public.checkout_rooms enable row level security;
alter table public.checkout_defects enable row level security;
alter table public.checkout_photos enable row level security;
alter table public.checkout_history enable row level security;
alter table storage.objects enable row level security;
create policy "rooms read" on public.checkout_rooms for select to authenticated using(public.is_management() or assigned_to=auth.uid() or cleaner_id=auth.uid());
create policy "rooms insert" on public.checkout_rooms for insert to authenticated with check(public.is_admin() and created_by=auth.uid());
create policy "rooms update" on public.checkout_rooms for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "defects read" on public.checkout_defects for select to authenticated using(exists(select 1 from public.checkout_rooms r where r.id=checkout_room_id));
create policy "defects insert" on public.checkout_defects for insert to authenticated with check(public.is_admin() and created_by=auth.uid());
create policy "photos read" on public.checkout_photos for select to authenticated using(exists(select 1 from public.checkout_rooms r where r.id=checkout_room_id));
create policy "photos insert" on public.checkout_photos for insert to authenticated with check(public.is_admin() and uploaded_by=auth.uid());
create policy "history insert" on public.checkout_history for insert to authenticated with check(public.is_admin() and actor_id=auth.uid());
-- This is the existing policy added by the 20261030033750 migration.
create policy "participants read registered inspection evidence" on storage.objects for select to authenticated
 using(bucket_id='checkout-evidence' and exists(select 1 from public.checkout_photos p join public.checkout_rooms r on r.id=p.checkout_room_id
 where p.storage_path=name and r.deleted_at is null and (public.is_management() or r.assigned_to=auth.uid() or r.cleaner_id=auth.uid())));
grant usage on schema public,auth,storage to anon,authenticated;
grant select on public.profiles,public.blocks,public.checkout_batches to authenticated;
grant select,insert,update on public.checkout_rooms,public.checkout_defects,public.checkout_photos,public.checkout_history to authenticated;
grant usage,select on sequence public.checkout_history_id_seq to authenticated;
grant select,insert,delete on storage.objects to authenticated;
create function public.fixture_assign_batch() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('checkout-batch-lifecycle',0));
 select id into new.batch_id from public.checkout_batches where state='active';
 if new.batch_id is null then raise exception 'No active batch';end if;
 return new;
end $$;
create trigger fixture_assign_batch before insert on public.checkout_rooms for each row execute function public.fixture_assign_batch();
`;

function input(source = "DF-2026-0071", roomNo = "A103", photos = true) {
  return {
    blockId: roomNo.startsWith("B") ? 2 : 1,
    blockCode: roomNo[0], roomNo, filename: "UTMSPACE_First_5_Rooms.pdf", fileHash: "a".repeat(64),
    defects: [{ sourceId: source, inspectionId: "PM-2026-0033", originalItem: "Kebersihan Dinding",
      originalFinding: "Cat terkopek Dinding kulat", originalAction: "Cat masih terkopek", sourceStatus: "Belum Dibaiki",
      description: `Wall moldy and paint peeling ${roomNo}`, title: `Wall moldy and paint peeling ${roomNo}`,
      reportedDate: "2026-11-04", pageNumber: 1,
      photos: photos ? [{ label: "after", sourcePage: 1, type: "image/jpeg", size: 100 }] : [],
    }],
  };
}
const mapping = () => [{ path: PATH, sourceId: "DF-2026-0071", photoIndex: 0 }];
type Imported = { created: boolean; roomId: string; reason?: string };
let db: PGlite;
async function login(id: string, role = "authenticated") {
  await db.exec(`reset role; set app.uid='${id}';set role ${role}`);
}
async function call(room = input(), photos = mapping(), importId: string = IMPORT) {
  const result = await db.query<{ result: Imported }>("select public.import_checkout_pdf_room($1,$2,$3) result", [room, importId, photos]);
  return result.rows[0].result;
}
async function counts() {
  await db.exec("reset role");
  const result = (await db.query<{ rooms: number; defects: number; photos: number; history: number }>(`
   select (select count(*)::integer from checkout_rooms) rooms,
    (select count(*)::integer from checkout_defects) defects,
    (select count(*)::integer from checkout_photos) photos,
    (select count(*)::integer from checkout_history) history`)).rows[0];
  await login(ADMIN);
  return result;
}
beforeAll(async () => {
  db = new PGlite(); await db.exec(fixture); await db.exec(migration); await login(ADMIN);
}, 30_000);
afterAll(async () => { await db?.close(); });

describe("UTMSPACE PDF import uses the existing checkout records atomically", () => {
  it("creates no task if an evidence upload is missing", async () => {
    await expect(call()).rejects.toThrow("Photo upload is incomplete");
    expect(await counts()).toEqual({ rooms: 0, defects: 0, photos: 0, history: 0 });
  });

  it("requires the recorded byte size and MIME type before saving a room", async () => {
    await db.query("insert into storage.objects values('checkout-evidence',$1,$2)", [PATH, { size: 100, mimetype: "image/png" }]);
    await expect(call()).rejects.toThrow("Photo upload is incomplete");
    await db.exec("reset role");
    await db.query("update storage.objects set metadata=$1 where name=$2", [{ size: 101, mimetype: "image/jpeg" }, PATH]);
    await login(ADMIN); await expect(call()).rejects.toThrow("Photo upload is incomplete");
    await db.exec("reset role");
    await db.query("update storage.objects set metadata=$1 where name=$2", [{ size: 100, mimetype: "image/jpeg" }, PATH]);
    await login(ADMIN);
  });

  it("rejects wrong-user paths, traversal, duplicate mappings and missing mappings", async () => {
    await expect(call(input(), [{ ...mapping()[0], path: PATH.replace(ADMIN, WORKER) }])).rejects.toThrow("Invalid PDF photo path");
    await expect(call(input(), [{ ...mapping()[0], path: `pdf-import/${ADMIN}/${IMPORT}/../${PHOTO}.jpg` }])).rejects.toThrow("Invalid PDF photo path");
    await expect(call(input(), [{ ...mapping()[0], photoIndex: 1 }])).rejects.toThrow("Invalid PDF photo index");
    await expect(call(input(), [])).rejects.toThrow("Attach every extracted photo");
    const duplicate = input(); duplicate.defects[0].photos.push({ ...duplicate.defects[0].photos[0] });
    await expect(call(duplicate, [mapping()[0], mapping()[0]])).rejects.toThrow("Duplicate or invalid photo mapping");
    expect(await counts()).toEqual({ rooms: 0, defects: 0, photos: 0, history: 0 });
  });

  it("saves the original findings and photos, leaves After evidence open, and creates one history entry", async () => {
    const imported = await call(); expect(imported.created).toBe(true);
    expect(await counts()).toEqual({ rooms: 1, defects: 1, photos: 1, history: 1 });
    const room = (await db.query<{ status: string; assigned_to: string | null; utmspace_pdf_source: { filename: string } }>("select * from checkout_rooms where id=$1", [imported.roomId])).rows[0];
    expect(room.status).toBe("second_inspection"); expect(room.assigned_to).toBeNull();
    expect(room.utmspace_pdf_source.filename).toBe("UTMSPACE_First_5_Rooms.pdf");
    const defect = (await db.query<{ id: string; status: string; utmspace_source_id: string; utmspace_pdf_source: Record<string, unknown> }>("select * from checkout_defects")).rows[0];
    expect(defect.status).toBe("open"); expect(defect.utmspace_source_id).toBe("DF-2026-0071");
    expect(defect.utmspace_pdf_source).toMatchObject({ originalFinding: "Cat terkopek Dinding kulat", sourceStatus: "Belum Dibaiki", reportedDate: "2026-11-04" });
    const photo = (await db.query<{ defect_id: string; kind: string; utmspace_pdf_source: Record<string, unknown> }>("select * from checkout_photos")).rows[0];
    expect(photo.defect_id).toBe(defect.id); expect(photo.kind).toBe("inspection");
    expect(photo.utmspace_pdf_source).toMatchObject({ label: "after", sourcePage: 1, sourceId: "DF-2026-0071" });
  });

  it("does not create duplicates on a retry or when the same source report is renamed", async () => {
    const retry = await call(); expect(retry.created).toBe(false); expect(retry.reason).toMatch(/already imported/);
    const renamed = input(); renamed.filename = "Different filename.pdf"; renamed.fileHash = "b".repeat(64);
    expect((await call(renamed)).created).toBe(false);
    expect(await counts()).toEqual({ rooms: 1, defects: 1, photos: 1, history: 1 });
  });

  it("keeps current room data and assignment when room spelling differs", async () => {
    await db.exec("reset role");
    await db.query("insert into checkout_rooms(block_id,room_no,created_by,utmspace_defects,status,assigned_to) values(1,'A-104',$1,'Existing defect','rectification',$2)", [ADMIN, WORKER]);
    await login(ADMIN);
    const skipped = await call(input("DF-2026-0791", "A104", false), []);
    expect(skipped.created).toBe(false); expect(skipped.reason).toMatch(/current batch/);
    const existing = (await db.query<{ utmspace_defects: string; assigned_to: string }>("select * from checkout_rooms where id=$1", [skipped.roomId])).rows[0];
    expect(existing.utmspace_defects).toBe("Existing defect"); expect(existing.assigned_to).toBe(WORKER);
  });

  it("retains archived source identity and does not overwrite it in a new batch", async () => {
    await db.exec("reset role");
    await db.exec("update checkout_rooms set batch_archived_at=now();update checkout_batches set state='closed';insert into checkout_batches(state) values('active')");
    await login(ADMIN);
    const old = await call(); expect(old.created).toBe(false); expect(old.reason).toMatch(/already imported/);
    const room = (await db.query<{ batch_archived_at: string | null }>("select * from checkout_rooms where id=$1", [old.roomId])).rows[0];
    expect(room.batch_archived_at).not.toBeNull();
    expect((await counts()).defects).toBe(1);
  });

  it("blocks mixed already-imported and new source references without partially creating records", async () => {
    const mixed = input("DF-2026-0071", "A103", false);
    mixed.defects.push({ ...mixed.defects[0], sourceId: "DF-2026-0072" });
    await expect(call(mixed, [])).rejects.toThrow("Some UTMSPACE defect references already exist");
    expect((await counts()).defects).toBe(1);
  });

  it("rejects unknown blocks, repeated references, invalid source IDs and empty original findings", async () => {
    const wrong = input("DF-2026-0100", "A105", false); wrong.blockId = 2;
    await expect(call(wrong, [])).rejects.toThrow("valid Block A or B room");
    const repeated = input("DF-2026-0100", "A105", false); repeated.defects.push({ ...repeated.defects[0] });
    await expect(call(repeated, [])).rejects.toThrow("Duplicate source defect");
    const invalid = input("not-source-id", "A105", false);
    await expect(call(invalid, [])).rejects.toThrow("Invalid PDF defect entry");
    const empty = input("DF-2026-0100", "A105", false); empty.defects[0].originalFinding = "";
    await expect(call(empty, [])).rejects.toThrow("Invalid PDF defect entry");
  });

  it("rolls back room, all defects, photos and history on a later write failure", async () => {
    await db.exec("reset role");
    await db.exec(`create function reject_test_defect() returns trigger language plpgsql as $$begin if new.utmspace_source_id='DF-2026-9999' then raise exception 'fixture write failure';end if;return new;end$$;
     create trigger reject_test_defect before insert on checkout_defects for each row execute function reject_test_defect()`);
    await login(ADMIN); const before = await counts();
    const partial = input("DF-2026-0100", "A105", false); partial.defects.push({ ...partial.defects[0], sourceId: "DF-2026-9999" });
    await expect(call(partial, [])).rejects.toThrow("fixture write failure");
    expect(await counts()).toEqual(before);
  });

  it("prevents imports while End Batch is generating reports", async () => {
    await db.exec("reset role;update checkout_batches set state='closing' where state='active'");
    await login(ADMIN);
    await expect(call(input("DF-2026-0100", "A105", false), [])).rejects.toThrow("Batch reports are being generated");
    await db.exec("reset role;update checkout_batches set state='active' where state='closing'"); await login(ADMIN);
  });

  it("accepts the same visible DF reference in different rooms while retaining each source identity", async () => {
    expect((await call(input("DF-2026-0599", "B116", false), [])).created).toBe(true);
    expect((await call(input("DF-2026-0599", "B117", false), [])).created).toBe(true);
    const sources = await db.query<{ utmspace_source_key: string }>("select utmspace_source_key from checkout_defects where utmspace_source_id='DF-2026-0599' order by utmspace_source_key");
    expect(sources.rows.map(x => x.utmspace_source_key)).toEqual(["B:B116:DF-2026-0599", "B:B117:DF-2026-0599"]);
    expect((await call(input("DF-2026-0599", "B117", false), [])).created).toBe(false);
  });

  it("preserves independent evidence associations and recheck captions for multiple defects", async () => {
    const room = input("DF-2026-0101", "A106");
    room.defects[0].photos[0].label = "before";
    room.defects.push({ ...room.defects[0], sourceId: "DF-2026-0102", photos: [{ label: "recheck", sourcePage: 2, type: "image/jpeg", size: 101 }] });
    const paths = [
      { path: PATH.replace(PHOTO, "00000000-0000-4000-8000-000000000024"), sourceId: "DF-2026-0101", photoIndex: 0 },
      { path: PATH.replace(PHOTO, "00000000-0000-4000-8000-000000000025"), sourceId: "DF-2026-0102", photoIndex: 0 },
    ];
    for (const [i, p] of paths.entries()) await db.query("insert into storage.objects values('checkout-evidence',$1,$2)", [p.path, { size: 100 + i, mimetype: "image/jpeg" }]);
    const created = await call(room, paths); expect(created.created).toBe(true);
    const joined = await db.query<{ utmspace_source_id: string; source_label: string; status: string }>(`
     select d.utmspace_source_id,p.utmspace_pdf_source->>'label' source_label,d.status
      from checkout_photos p join checkout_defects d on d.id=p.defect_id where p.checkout_room_id=$1 order by d.utmspace_source_id`, [created.roomId]);
    expect(joined.rows).toEqual([
      { utmspace_source_id: "DF-2026-0101", source_label: "before", status: "open" },
      { utmspace_source_id: "DF-2026-0102", source_label: "recheck", status: "open" },
    ]);
  });
});

describe("PDF evidence preserves existing participant access", () => {
  it("denies importer execution to non-admin accounts and anonymous users", async () => {
    for (const id of [WORKER, VIEWER]) {
      await login(id); await expect(call(input("DF-2026-0100", "A105", false), [])).rejects.toThrow("Administrator access required");
    }
    await login("", "anon"); await expect(call()).rejects.toThrow("permission denied for function");
    await login(ADMIN);
  });

  it("allows unregistered staging only for the owning Admin, and denies replacing registered evidence", async () => {
    await login(WORKER);
    await expect(db.query("insert into storage.objects values('checkout-evidence',$1,$2)", [PATH.replace(PHOTO, "00000000-0000-4000-8000-000000000021"), {}])).rejects.toThrow("row-level security");
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(0);
    await login(ADMIN);
    await expect(db.query("insert into storage.objects values('checkout-evidence',$1,$2)", [PATH.replace(ADMIN, OTHER), {}])).rejects.toThrow("row-level security");
    expect((await db.query("delete from storage.objects where name=$1 returning name", [PATH])).rows).toHaveLength(0);
    const stagingPath = PATH.replace(PHOTO, "00000000-0000-4000-8000-000000000022");
    await db.query("insert into storage.objects values('checkout-evidence',$1,$2)", [stagingPath, {}]);
    expect((await db.query("delete from storage.objects where name=$1 returning name", [stagingPath])).rows).toHaveLength(1);
  });

  it("makes the evidence readable to assigned maintenance and management, not another worker", async () => {
    await db.exec("reset role"); await db.query("update checkout_rooms set assigned_to=$1 where room_no='A103'", [WORKER]);
    await login(WORKER); expect((await db.query("select name from storage.objects where name=$1", [PATH])).rows).toHaveLength(1);
    await login(OTHER); expect((await db.query("select name from storage.objects where name=$1", [PATH])).rows).toHaveLength(0);
    await login(VIEWER); expect((await db.query("select name from storage.objects where name=$1", [PATH])).rows).toHaveLength(1);
    await login(ADMIN);
  });
});
