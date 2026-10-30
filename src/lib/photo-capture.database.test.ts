// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,expect,it} from 'vitest';
const db=new PGlite();
const id='00000000-0000-4000-8000-000000000001';
const paths=Array.from({length:21},(_,i)=>`complaints/${id}/00000000-0000-4000-8000-${String(i).padStart(12,'0')}.jpg`);
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create schema storage;
 create table complaints(id uuid primary key,complaint_no text,photo_url text);
 create table waste_collections(id uuid primary key,photos text[] constraint waste_collections_photos_check check(cardinality(photos) between 1 and 5));
 create table storage.objects(bucket_id text,name text,metadata jsonb);
 create function public.cleaner_owns_complaint_path(text) returns boolean language sql as $$select coalesce(current_setting('test.owner',true),'yes')='yes'$$;
 insert into complaints values('${id}','TEST',null);`);
 await db.exec(readFileSync('supabase/migrations/20261030034824_photo_capture_twenty.sql','utf8'));
 for(const path of paths)await db.query('insert into storage.objects values($1,$2,$3)',['checkout-evidence',path,{size:100}]);
},30000);
afterAll(()=>db.close());
it.each([7,20])('persists %i photos and reads every path back in order',async count=>{
 await db.query('select finalize_cleaner_complaint_photos($1,$2)',[id,paths.slice(0,count)]);
 const {rows}=await db.query<{photo_paths:string[];photo_url:string}>('select photo_paths,photo_url from complaints where id=$1',[id]);
 expect(rows[0].photo_paths).toEqual(paths.slice(0,count));
 expect(rows[0].photo_url).toBe(`storage://checkout-evidence/${paths[0]}`);
 await db.query('insert into waste_collections values($1,$2)',[crypto.randomUUID(),paths.slice(0,count)]);
});
it('rejects 21 photos, duplicates and incomplete uploads without replacing saved evidence',async()=>{
 for(const invalid of [paths,[paths[0],paths[0]],[`complaints/${id}/${crypto.randomUUID()}.jpg`]])await expect(db.query('select finalize_cleaner_complaint_photos($1,$2)',[id,invalid])).rejects.toThrow();
 expect((await db.query<{photo_paths:string[]}>('select photo_paths from complaints')).rows[0].photo_paths).toHaveLength(20);
 await expect(db.query('insert into waste_collections values($1,$2)',[crypto.randomUUID(),paths])).rejects.toThrow();
});
it('requires the active cleaner to own the complaint',async()=>{
 await db.exec("set test.owner='no'");
 await expect(db.query('select finalize_cleaner_complaint_photos($1,$2)',[id,paths.slice(0,7)])).rejects.toThrow('verification');
});
