import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import type {ReactNode} from 'react';
vi.mock('@/lib/auth',()=>({requireRole:async()=>({id:'tech',role:'maintenance_staff'})}));
vi.mock('@/components/app-shell',()=>({AppShell:({children}:{children:ReactNode})=><main>{children}</main>}));
vi.mock('../actions',()=>({completeRectification:vi.fn(),completeCleaning:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:(table:string)=>{
 const data=table==='checkout_rooms'?{id:'room',reference_no:'TEST',room_no:'805',status:'rectification',assigned_to:'tech'}:table==='checkout_defects'?[{id:'a',description:'Fan broken',status:'open',source:'utmspace'},{id:'b',description:'Tap leaking',status:'open',source:'utmspace'},{id:'c',description:'Chair',status:'rectified',source:'utmspace'}]:[];
 const q={select:()=>q,is:()=>q,eq:()=>q,order:()=>q,single:async()=>({data}),then:(resolve:(r:unknown)=>unknown)=>Promise.resolve({data}).then(resolve)};return q;
}})}));
import Page from './page';
afterEach(cleanup);
it('offers a separate photo and update submission for each open defect',async()=>{
 const {container}=render(await Page({params:Promise.resolve({id:'room'}),searchParams:Promise.resolve({})}));
 const buttons=screen.getAllByRole('button',{name:'Update this defect'});expect(buttons).toHaveLength(2);
 expect(buttons.map(b=>b.closest('form')?.querySelector<HTMLInputElement>('input[name=rectifiedDefects]')?.value)).toEqual(['a','b']);
 for(const button of buttons){const form=button.closest('form')!;expect(form.querySelectorAll('[name=rectifiedDefects]')).toHaveLength(1);expect(form.querySelector('input[type=file][multiple]')).toBeInTheDocument();expect(form.querySelector('input[capture=environment]')).toBeInTheDocument();expect(form.querySelector('textarea')).toBeRequired()}
 expect(container.querySelector('form form')).toBeNull();
});
