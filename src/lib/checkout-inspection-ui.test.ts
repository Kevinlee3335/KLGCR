// @vitest-environment node
// @ts-expect-error jsdom is a test runtime dependency without bundled declarations.
import {JSDOM} from "jsdom";
import {readFileSync} from "node:fs";
import {it,expect,vi} from "vitest";
import {inspectionFindings,type ABInspection} from "./checkout-inspection";
function setup(){
 const dom=new JSDOM(readFileSync("public/checkout-ab-inspection.html","utf8"),{url:"https://klgcr-maintenance-system.vercel.app/checkout-ab-inspection.html",runScripts:"dangerously",beforeParse(w:Window & typeof globalThis){
  w.structuredClone=structuredClone;
  w.URL.createObjectURL=vi.fn(()=>"blob:photo");w.URL.revokeObjectURL=vi.fn();
  w.HTMLCanvasElement.prototype.getContext=vi.fn(()=>({drawImage:vi.fn()})) as unknown as typeof w.HTMLCanvasElement.prototype.getContext;
  w.HTMLCanvasElement.prototype.toDataURL=vi.fn(()=>"data:image/jpeg;base64,cGhvdG8=");
  w.Image=class {width=1000;height=800;onload:()=>void=()=>{};set src(_value:string){queueMicrotask(()=>this.onload())}} as unknown as typeof w.Image;
 }});
 const w=dom.window;
 w.eval("window.testUI={start,fs,status,save,photos,facilityPhotos,getRecord:()=>cur,getCategories:()=>FAC,getPending:()=>photoPending};");
 return {dom,w,ui:w.testUI as {start:(room:string)=>void;fs:(name:string,status:string)=>void;status:(i:number,o:number,s:string)=>void;save:(final:boolean)=>void;photos:(i:number,o:number,files:File[])=>Promise<void>;facilityPhotos:(n:string,files:File[])=>Promise<void>;getRecord:()=>ABInspection;getCategories:()=>[string,string[]][];getPending:()=>number}};
}
it("every X across all 24 inspection items converts to a defect, and switching back to Good removes only that defect",()=>{
 const {dom,ui}=setup();try{
 ui.start("B106");const r=ui.getRecord();
 for(let i=0;i<5;i++){ui.status(i,0,"defect");r.items[i][0].confirm=true;}
 const names=ui.getCategories().flatMap(c=>c[1]);for(const n of names)ui.fs(n,"defect");
 const findings=inspectionFindings(r);expect(findings.filter(f=>f.description)).toHaveLength(5+names.length);
 for(const n of names)expect(findings.some(f=>f.description.startsWith(n+" ·"))).toBe(true);
 ui.fs("Fan","good");expect(inspectionFindings(r)).toHaveLength(4+names.length);
 ui.status(0,0,"good");expect(inspectionFindings(r)).toHaveLength(3+names.length);
 }finally{dom.window.close()}
});
it("accumulates seven camera shots, prevents racing submissions, enforces 20 across all items and preserves draft photos after reopening",async()=>{
 const {dom,w,ui}=setup();try{
 ui.start("B106");ui.fs("Fan","defect");const r=ui.getRecord();r.by="Inspector";r.items.flat().forEach(v=>v.confirm=true);
 const files=Array.from({length:7},(_,i)=>new w.File(["photo"],"photo"+i+".jpg",{type:"image/jpeg"})) as unknown as File[];
 const pending=ui.facilityPhotos("Fan",files);expect(ui.getPending()).toBe(7);ui.save(false);expect(w.document.body.textContent).toContain("wait for photos");await pending;
 expect(ui.getRecord().fac.Fan.photos).toHaveLength(7);expect(inspectionFindings(ui.getRecord())[0].photos).toHaveLength(7);
 await ui.photos(0,0,Array.from({length:13},()=>files[0]));expect(ui.getRecord().items[0][0].photos).toHaveLength(13);
 await ui.facilityPhotos("Fan",[files[0]]);expect(ui.getRecord().fac.Fan.photos).toHaveLength(7);expect(w.document.body.textContent).toContain("Maximum 20 photos");
 ui.save(false);ui.start("B106");expect(ui.getRecord().fac.Fan.photos).toHaveLength(7);expect(ui.getRecord().items[0][0].photos).toHaveLength(13);
 }finally{dom.window.close()}
});
