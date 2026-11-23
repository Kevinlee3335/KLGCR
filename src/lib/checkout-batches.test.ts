// @vitest-environment node
import {expect,it} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import sharp from 'sharp';
import {batchMaterialTotals,batchMovements,type BatchSnapshot} from './checkout-batches';
import {checkoutBatchPdf} from './checkout-batch-pdf';
import {writeFileSync,mkdirSync,readFileSync,existsSync} from 'node:fs';
const empty=():BatchSnapshot=>({version:1,batch:{id:'batch',batch_no:'COB-2026-0001',name:'QA',state:'closed',started_at:'2026-10-28T04:00:00Z',closed_at:'2026-11-23T08:00:00Z',closed_by_name:'Test Admin',summary_document_id:'s',details_document_id:'d'},rooms:[],defects:[],history:[],photos:[],painting:[],requests:[],request_items:[],decisions:[],issues:[],stockouts:[],returns:[]});
it('counts actual issues and direct stock-outs once, keeps units separate, and uses exact hundredths for returns',()=>{
 const s=empty();s.issues=[{id:1,inventory_item_id:'i',description:'Cleaner',unit:'L',inventory_group:'cleaner',qty:.3}];s.stockouts=[{id:2,inventory_item_id:'i',description:'Cleaner',unit:'L',inventory_group:'cleaner',qty:.1},{id:3,inventory_item_id:'i',description:'Cleaner',unit:'bottle',inventory_group:'cleaner',qty:1}];s.returns=[{id:'r',issue_id:1,qty:.1}];s.request_items=[{id:'not-issued',requested_qty:99,approved_qty:99}];
 expect(batchMovements(s).map(m=>m.net)).toEqual([.2,.1,1]);const totals=batchMaterialTotals(s);expect(totals.find(t=>t.unit==='L')).toMatchObject({quantity:.4,returned:.1,net:.3});expect(totals).toHaveLength(2);
});
it('produces one A4 summary with 33 distinct materials and a complete paginated report including all photos',async()=>{
 const s=empty();s.rooms=[{id:'r',reference_no:'COR-QA',room_no:'101',block:'A',status:'ready_for_occupancy',deleted_at:null,created_at:s.batch.started_at,ready_at:s.batch.closed_at,maintenance_name:'Test Maintenance',cleaner_name:'Test Cleaner',inspection_checklist:null}];
 s.issues=Array.from({length:33},(_,i)=>({id:i+1,inventory_item_id:'i'+i,description:i===0?'PVC Joint 20 mm (Grey Pipe)':'Window Handle Material '+i,unit:i===32?'L':'pcs',inventory_group:i>=30?'cleaner':'building',qty:i+1,checkout_room_id:'r',issued_at:s.batch.started_at,staff_name:'Test Worker',issued_by_name:'Admin'}));
 s.history=Array.from({length:48},(_,i)=>({id:i,checkout_room_id:'r',action:'rectification_completed',actor_name:'QA',created_at:s.batch.started_at,notes:'Event '+i+' - ' + 'This is a full work record. '.repeat(5)}));
 s.photos=Array.from({length:5},(_,i)=>({id:'photo-'+i,checkout_room_id:'r',kind:'completion',storage_path:'photo-'+i+'.jpg',created_at:s.batch.closed_at}));
 const jpg=await sharp({create:{width:640,height:480,channels:3,background:'#c8b07c'}}).jpeg().toBuffer();
 const summary=await checkoutBatchPdf(s,'summary'),details=await checkoutBatchPdf(s,'details',async()=>jpg);
 const summaryPdf=await PDFDocument.load(summary),fullPdf=await PDFDocument.load(details);expect(summaryPdf.getPageCount()).toBe(1);expect(summaryPdf.getPage(0).getSize()).toEqual({width:595.28,height:841.89});expect(fullPdf.getPageCount()).toBeGreaterThan(4);
 await expect(checkoutBatchPdf(s,'details')).rejects.toThrow('photo loader is required');
 if(process.env.CHECKOUT_PDF_QA==='1'){mkdirSync('/tmp/checkout-batch-qa',{recursive:true});writeFileSync('/tmp/checkout-batch-qa/summary.pdf',summary);writeFileSync('/tmp/checkout-batch-qa/details.pdf',details);if(existsSync('/tmp/checkout-batch-qa/live-materials.json')){const live=empty();live.issues=JSON.parse(readFileSync('/tmp/checkout-batch-qa/live-materials.json','utf8')).map((m:Record<string,unknown>,i:number)=>({...m,id:i+1}));writeFileSync('/tmp/checkout-batch-qa/live-summary.pdf',await checkoutBatchPdf(live,'summary'));if(existsSync('/tmp/checkout-batch-qa/live-snapshot.json')){const real=JSON.parse(readFileSync('/tmp/checkout-batch-qa/live-snapshot.json','utf8')) as BatchSnapshot;real.batch.closed_at='2026-11-23T08:00:00Z';real.batch.closed_by_name='QA PREVIEW';writeFileSync('/tmp/checkout-batch-qa/real-data-summary.pdf',await checkoutBatchPdf(real,'summary'));writeFileSync('/tmp/checkout-batch-qa/real-data-layout.pdf',await checkoutBatchPdf(real,'details',async()=>jpg));}}}
},process.env.CHECKOUT_PDF_QA==='1'?180_000:30_000);
