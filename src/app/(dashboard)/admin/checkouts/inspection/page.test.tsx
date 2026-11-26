import {cleanup,render} from '@testing-library/react';
import type {ReactNode} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';

const state=vi.hoisted(()=>({rows:[] as Record<string,unknown>[],inspector:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireCheckoutInspector:async()=>({role:'admin'})}));
vi.mock('@/components/app-shell',()=>({AppShell:({children}:{children:ReactNode})=><main>{children}</main>}));
vi.mock('@/components/checkout-ab-inspector',()=>({CheckoutABInspector:(props:unknown)=>{state.inspector(props);return null;}}));
vi.mock('@/lib/checkout-inspection',()=>({inspectionRepairKeys:()=>[]}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:()=>{
 let rows=[...state.rows];
 const q={
  select:()=>q,
  is:(field:string,value:unknown)=>{rows=rows.filter(row=>row[field]===value);return q;},
  not:(field:string,_operator:string,value:unknown)=>{rows=rows.filter(row=>row[field]!==value);return q;},
  order:()=>q,
  range:async(first:number,last:number)=>({data:rows.slice(first,last+1),error:null}),
 };
 return q;
}})}));
import Page from './page';

beforeEach(()=>{state.rows=[];state.inspector.mockClear();});
afterEach(cleanup);

it.each(['AB','CD'])('loads only current %s inspections while keeping archived rows stored',async blocks=>{
 const b=blocks[0];
 const archived={id:'old',deleted_at:null,batch_archived_at:'2026-11-26T04:00:00Z',created_at:'2026-11-20T03:00:00Z',status:'ready_for_occupancy',inspection_checklist:{id:'old',b,ph:{}},checkout_defects:[]};
 const current={...archived,id:'new',batch_archived_at:null,inspection_checklist:{id:'new',b,ph:{}}};
 state.rows=[archived,current,{...current,id:'deleted',deleted_at:'2026-11-26T05:00:00Z'}];
 render(await Page({searchParams:Promise.resolve({blocks})}));
 expect(state.inspector.mock.calls.at(-1)![0].initialInspections.map((r:{checkoutId:string})=>r.checkoutId)).toEqual(['new']);
 expect(state.rows).toHaveLength(3);
});

it('passes an empty snapshot immediately after the last batch has closed',async()=>{
 state.rows=[{id:'old',deleted_at:null,batch_archived_at:'2026-11-26T04:00:00Z',inspection_checklist:{id:'old',b:'A'},checkout_defects:[]}];
 render(await Page({searchParams:Promise.resolve({})}));
 expect(state.inspector.mock.calls.at(-1)![0]).toMatchObject({initialInspections:[],loadError:false});
});
