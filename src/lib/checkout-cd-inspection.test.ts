// @vitest-environment node
// @ts-expect-error jsdom test dependency
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {it,expect,vi} from 'vitest';
import {CD_CATEGORIES,cdInspectionFindings,cdRoomPax,type CDInspection} from './checkout-cd-inspection';
const record=():CDInspection=>({id:'00000000-0000-4000-8000-000000000010',b:'C',room:218,l:2,t:6,round:1,date:'2026-11-20',by:'Kevin',reason:'Handover at Vacation',it:Object.fromEntries(CD_CATEGORIES.flatMap(([,items],ci)=>items.map((_,si)=>[`${ci}.${si}`,0]))),nt:{},ph:{}});
it('uses the approved room types and converts each C/D checklist fault with its category notes and photos',()=>{
 expect(cdRoomPax('C','101')).toBe(2);expect(cdRoomPax('C','217')).toBe(4);expect(cdRoomPax('C','218')).toBe(6);expect(cdRoomPax('D','431')).toBe(2);expect(cdRoomPax('D','432')).toBeNull();
 const r=record();expect(cdInspectionFindings(r)).toEqual([]);
 r.it['1.0']=2;r.it['1.1']=1;r.nt['1']='Not working';r.ph!['1']=['photo1','photo2'];
 const defects=cdInspectionFindings(r);
 expect(defects).toEqual([{description:'Electrical Fixtures · Wall Fans · Qty 2: Not working',photos:['photo1','photo2']},{description:'Electrical Fixtures · Lightings · Qty 1: Not working',photos:[]}]);
 delete r.it['1.0'];expect(()=>cdInspectionFindings(r)).toThrow('every item');
});
it('rejects an invalid room type, invalid counts and more than 20 photos',()=>{
 const r=record();r.t=4;expect(()=>cdInspectionFindings(r)).toThrow('Invalid C/D');r.t=6;r.it['1.0']=-1;expect(()=>cdInspectionFindings(r)).toThrow('every item');r.it['1.0']=0;r.ph!['1']=Array(21).fill('photo');expect(()=>cdInspectionFindings(r)).toThrow('Maximum 20');
});
it('keeps the approved checklist, requires all checks, preserves drafts and posts to the system without the old endpoint',()=>{
 const html=readFileSync('public/checkout-cd-inspection.html','utf8');
 expect(html).not.toContain('/api/handover/checkout-defects');
 const dom=new JSDOM(html,{url:'https://klgcr-maintenance-system.vercel.app/checkout-cd-inspection.html',runScripts:'dangerously',beforeParse(w:Window & typeof globalThis){w.structuredClone=structuredClone;w.alert=vi.fn();}});
 try{
  const w=dom.window;w.eval('window.testUI={S,A,start,CATS,RM};');const {S,A,start,CATS}=w.testUI;
  expect(JSON.parse(JSON.stringify(CATS))).toEqual(CD_CATEGORIES);
  start('C','2',218);expect(S.cur.t).toBe(6);S.cur.by='Kevin';
  A.save();expect(w.alert).toHaveBeenCalledWith(expect.stringContaining('every item'));
  S.cur.it=record().it;S.cur.it['1.0']=2;S.cur.ph['1']=['data:image/jpeg;base64,cGhvdG8='];A.draft();S.cur=null;start('C','2',218);
  expect(S.cur.it['1.0']).toBe(2);expect(S.cur.ph['1']).toHaveLength(1);
  expect(cdInspectionFindings(S.cur)[0].description).toContain('Wall Fans');
 }finally{dom.window.close()}
});
