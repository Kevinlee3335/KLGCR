// @vitest-environment node
// @ts-expect-error jsdom test dependency
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {it,expect,vi} from 'vitest';
import {CD_CATEGORIES,cdInspectionFindings,cdRoomPax,cdUploadedPhotoGroups,type CDInspection} from './checkout-cd-inspection';
import {inspectionRepairKeys} from './checkout-inspection';
const record=():CDInspection=>({id:'00000000-0000-4000-8000-000000000010',b:'C',room:218,l:2,t:6,round:1,date:'2026-11-20',by:'Kevin',reason:'Handover at Vacation',it:Object.fromEntries(CD_CATEGORIES.flatMap(([,items],ci)=>items.map((_,si)=>[`${ci}.${si}`,0]))),nt:{},ph:{}});
function setup(lang='en'){
 let html=readFileSync('public/checkout-cd-inspection.html','utf8').replace('<script defer src="/checkout-cd-inspection.js"></script>','');
 html=html.replace('</body>','<script>'+readFileSync('public/checkout-cd-inspection.js','utf8')+'</script></body>');
 const dom=new JSDOM(html,{url:'https://klgcr-maintenance-system.vercel.app/checkout-cd-inspection.html?lang='+lang,runScripts:'dangerously',beforeParse(w:Window & typeof globalThis){
  w.structuredClone=structuredClone;w.alert=vi.fn();w.URL.createObjectURL=vi.fn(()=>'blob:photo');w.URL.revokeObjectURL=vi.fn();
  w.HTMLCanvasElement.prototype.getContext=vi.fn(()=>({drawImage:vi.fn()})) as unknown as typeof w.HTMLCanvasElement.prototype.getContext;
  w.HTMLCanvasElement.prototype.toDataURL=vi.fn(()=>'data:image/jpeg;base64,cGhvdG8=');
  w.Image=class {width=1500;height=1000;onload=()=>{};set src(_url:string){queueMicrotask(()=>this.onload());}} as unknown as typeof w.Image;
 }});
 dom.window.eval('window.ui={S,A,start,mergeSubmitted,symbol,comp,repair,addPhotos,checked,filterInspectionRooms,getPending:()=>photoPending,CATS,ROOMS};');
 return {dom,w:dom.window,ui:dom.window.ui};
}
it('preserves C/D room types, original catalog and legacy findings/photos',()=>{
 expect(cdRoomPax('C','101')).toBe(2);expect(cdRoomPax('C','217')).toBe(4);expect(cdRoomPax('C','218')).toBe(6);expect(cdRoomPax('D','431')).toBe(2);expect(cdRoomPax('D','432')).toBeNull();
 const r=record();expect(cdInspectionFindings(r)).toEqual([]);
 r.it['1.0']=2;r.it['1.1']=1;r.nt['1']='Not working';r.ph!['1']=['photo1','photo2'];
 expect(cdInspectionFindings(r)).toEqual([{description:'Electrical Fixtures · Wall Fans · Qty 2: Not working',photos:['photo1','photo2']},{description:'Electrical Fixtures · Lightings · Qty 1: Not working',photos:[]}]);
 const {dom,ui}=setup();try{expect(JSON.parse(JSON.stringify(ui.CATS))).toEqual(CD_CATEGORIES);}finally{dom.window.close();}
});
it('requires a defect type, quantity and Other remark while photos remain optional',()=>{
 const r=record();r.schemaVersion=2;r.it['1.0']=1;
 expect(()=>cdInspectionFindings(r)).toThrow('defect type');r.dt={'1.0':{type:'Other',remark:''}};
 expect(()=>cdInspectionFindings(r)).toThrow('Other requires');r.dt['1.0'].remark='Fan vibrates';
 expect(cdInspectionFindings(r)[0]).toEqual({description:'Electrical Fixtures · Wall Fans · Other · Qty 1: Fan vibrates',photos:[]});
 r.t=4;expect(()=>cdInspectionFindings(r)).toThrow('Invalid C/D');r.t=6;r.it['1.0']=-1;expect(()=>cdInspectionFindings(r)).toThrow('every item');r.it['1.0']=1;r.ph!['1.0']=Array(21).fill('photo');expect(()=>cdInspectionFindings(r)).toThrow('Maximum 20');
});
it('maps every faulty item to repairs without changing original results, including partial/duplicate/reopened repairs',()=>{
 const r=record();r.schemaVersion=2;r.it['1.0']=2;r.it['1.1']=1;r.dt={'1.0':{type:'Broken',remark:'Motor'},'1.1':{type:'Not Working',remark:'Tube'}};
 const original=structuredClone(r),findings=cdInspectionFindings(r),defects=findings.map((f,i)=>({description:f.description,status:i?'open':'rectified'}));
 expect(inspectionRepairKeys(r,defects)).toEqual(['cd-1.0']);expect(r).toEqual(original);
 defects.push({...defects[0],status:'open'});expect(inspectionRepairKeys(r,defects)).toEqual([]);
 defects[2].status='rectified';defects[1].status='rectified';expect(inspectionRepairKeys(r,defects)).toEqual(['cd-1.0','cd-1.1']);
 defects[0].status='open';expect(inspectionRepairKeys(r,defects)).toEqual(['cd-1.1']);
 expect(inspectionRepairKeys(r,[])).toEqual([]);
});
it('keeps item and legacy category photo associations when upload order differs from object key order',()=>{
 const r=record();r.it['0.0']=1;r.it['1.0']=1;r.ph={'1':['category'],'0.0':['item0'],'1.0':['item1']};
 const images=cdInspectionFindings(r).flatMap(f=>f.photos.map(url=>({url})));
 expect(images.map(i=>i.url)).toEqual(['item0','item1','category']);
 expect(cdUploadedPhotoGroups(r,images,['path0','path1','path2'])).toEqual({'1':['path2'],'0.0':['path0'],'1.0':['path1']});
});
it('defaults all 35 checks Good and separates inspection completion from repair completion',()=>{
 const {dom,ui}=setup();try{ui.start('C','2',218);const r=ui.S.cur;expect(r.t).toBe(6);expect(ui.checked(r)).toBe(35);expect(ui.comp(r)).toBe(1);ui.A.bad('1.0');expect(ui.comp(r)).toBe(1);expect(ui.repair(r)).toEqual({total:1,completed:0,remaining:1});r.by='Kevin';expect(cdInspectionFindings(r)).toHaveLength(1);}finally{dom.window.close();}
});
it('shows repaired ticks and retains reports/photos, then carries only unresolved faults into a fresh round',()=>{
 const {dom,ui}=setup();try{const r=record();r.it['1.0']=1;r.it['1.1']=1;r.ph={'1.0':['https://example.com/private-photo']};
 ui.mergeSubmitted([{checklist:r,created_at:'2026-11-20T03:00:00Z',rectifiedItems:['cd-1.0'],repair:{total:2,completed:1,remaining:1},checkoutId:'room-id',roomStatus:'rectification'}]);
 const saved=ui.S.recs[0];expect(ui.symbol(saved,'1.0')).toBe('✅');expect(ui.symbol(saved,'1.1')).toBe('❌');expect(saved.it['1.0']).toBe(1);
 ui.A.rep(saved.id);expect(dom.window.document.body.textContent).toContain('Original inspection: Defect');expect(dom.window.document.querySelector('img')?.src).toBe('https://example.com/private-photo');
 ui.start('C','2',218);expect(ui.S.cur.it['1.0']).toBe(0);expect(ui.S.cur.it['1.1']).toBe(1);expect(ui.S.cur.round).toBe(2);expect(ui.S.cur.ph).toEqual({});
 }finally{dom.window.close();}
});
it('preserves seven photos and draft identity, blocks racing submit, and caps the whole room at 20',async()=>{
 const {dom,w,ui}=setup();try{ui.start('C','2',218);ui.S.cur.by='Kevin';ui.A.bad('1.0');const id=ui.S.cur.id;
 const file=new w.File(['photo'],'photo.jpg',{type:'image/jpeg'});
 const pending=ui.addPhotos('1.0',Array(7).fill(file));expect(ui.getPending()).toBe(7);ui.A.save();expect(w.document.body.textContent).toContain('wait for photos');await pending;
 expect(ui.S.cur.ph['1.0']).toHaveLength(7);await ui.addPhotos('2.0',Array(13).fill(file));await ui.addPhotos('1.0',[file]);expect(ui.S.cur.ph['1.0']).toHaveLength(7);
 ui.A.draft();ui.S.cur=null;ui.start('C','2',218);expect(ui.S.cur.id).toBe(id);expect(ui.S.cur.ph['1.0']).toHaveLength(7);expect(ui.S.cur.ph['2.0']).toHaveLength(13);
 }finally{dom.window.close();}
});
it('searches rooms and shows Malay staff labels while retaining English defect values',async()=>{
 const {dom,w,ui}=setup('ms');try{ui.filterInspectionRooms('D431');expect(w.document.querySelector('#pr').value).toBe('D431');ui.start('D','4',431);ui.A.bad('1.0');await new Promise(resolve=>setTimeout(resolve,0));expect(w.document.body.textContent).toContain('Pemeriksaan');expect(w.document.querySelector('[data-a="type"]').value).toBe('Broken');expect(cdInspectionFindings({...ui.S.cur,by:'Inspector'})[0].description).toContain('Broken');}finally{dom.window.close();}
});
it('converts and tracks all 35 C/D checklist items, without missing window or hardware checks',()=>{
 const r=record();r.schemaVersion=2;r.dt={};
 for(const [key] of Object.entries(r.it)){r.it[key]=1;r.dt[key]={type:'Broken',remark:'Test defect'};}
 const findings=cdInspectionFindings(r);expect(findings).toHaveLength(35);
 expect(findings.some(f=>f.description.includes('Windows & Grilles · Window lock'))).toBe(true);
 expect(findings.some(f=>f.description.includes('Windows & Grilles · Windows'))).toBe(true);
 const defects=findings.map(f=>({description:f.description,status:'rectified'}));
 expect(inspectionRepairKeys(r,defects)).toHaveLength(35);
});
