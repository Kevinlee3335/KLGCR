// @vitest-environment node
import {createClient} from '@supabase/supabase-js';
import {expect,it,vi} from 'vitest';
import {streamPage} from '@/test/stream-page';
import Page from './page';

const mocks=vi.hoisted(()=>({db:vi.fn(),sign:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireRole:async()=>({role:'cleaner',id:'worker'})}));
vi.mock('@/lib/supabase/server',()=>({createClient:mocks.db}));
vi.mock('@/lib/evidence-urls',()=>({signEvidencePhotos:mocks.sign}));
vi.mock('@/components/app-shell',()=>({AppShell:({children}:{children:React.ReactNode})=><main>{children}</main>}));
vi.mock('@/components/daily-task-completion-form',()=>({DailyTaskCompletionForm:()=> <form>Fixture operation form</form>}));
it('opens the owned task and completion form before its private photos have been signed',async()=>{
 let sign!: (rows:unknown[])=>void;
 mocks.sign.mockReturnValue(new Promise(resolve=>{sign=resolve;}));
 const urls:URL[]=[];
 const evidence={id:'p',storage_path:'p.jpg',created_at:'2026-11-01T01:00:00Z'};
 mocks.db.mockResolvedValue(createClient('https://tasks.example','fixture',{global:{fetch:async input=>{
   const url=new URL(String(input));urls.push(url);
   return Response.json(url.pathname.endsWith('daily_task_photos')?[evidence]:{id:3,title:'Owned task fixture',task_date:'2026-11-01',status:'in_progress',activity:[]});
 }}}));
 const page=streamPage(await Page({params:Promise.resolve({id:'3'})}));
 try {
   await vi.waitFor(()=>expect(page.html()).toContain('Fixture operation form'));
   expect(page.html()).toContain('Owned task fixture');
   expect(page.html()).toContain('Loading photo evidence');
   expect(urls[0].searchParams.get('assigned_to')).toBe('eq.worker');
   expect(urls[1].searchParams.get('task_id')).toBe('eq.3');
   expect(mocks.sign).toHaveBeenCalledWith(expect.anything(),'checkout-evidence',[evidence]);
   sign([{...evidence,url:'https://tasks.example/signed-photo'}]);
   await vi.waitFor(()=>expect(page.html()).toContain('href="https://tasks.example/signed-photo"'));
   expect(page.errors).toEqual([]);
 } finally {page.close();}
});
