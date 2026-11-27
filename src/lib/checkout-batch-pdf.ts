import { checkoutPdfDefectTitle } from "./checkout-pdf-import";
import {PDFDocument,rgb,type PDFFont,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {batchDate,batchMaterialTotals,batchMovements,batchQuantity,batchRoomLabel,batchSummary,type BatchSnapshot,type SnapshotRow} from './checkout-batches';
import {CD_CATEGORIES} from './checkout-cd-inspection';
const A4:[number,number]=[595.28,841.89],margin=35,width=A4[0]-margin*2;
const ink=rgb(.10,.11,.12),gold=rgb(.66,.47,.13),gray=rgb(.38,.40,.42),line=rgb(.86,.85,.82),pale=rgb(.975,.965,.935);
const s=(v:unknown)=>v==null?'Not recorded':typeof v==='object'?JSON.stringify(v):String(v);
const clean=(v:unknown)=>s(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
export type BatchPhotoLoader=(photo:SnapshotRow)=>Promise<Uint8Array>;
export async function checkoutBatchPdf(snapshot:BatchSnapshot,kind:'summary'|'details',loadPhoto?:BatchPhotoLoader){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const [regular,strong,logoBytes]=await Promise.all([readFile(join(process.cwd(),'src/lib/finance-fonts/regular.ttf')),readFile(join(process.cwd(),'src/lib/finance-fonts/bold.ttf')),readFile(join(process.cwd(),'public/klg-campus-residence-logo.png'))]);
 const font=await pdf.embedFont(regular,{subset:true}),bold=await pdf.embedFont(strong,{subset:true}),logo=await pdf.embedPng(logoBytes);
 pdf.setTitle(snapshot.batch.batch_no+' - '+(kind==='summary'?'Summary':'Full Details'));pdf.setAuthor('KLG Campus Residence');
 let page!:PDFPage;let y=0;
 function txt(value:unknown,x:number,at:number,size=9,b=false,color=ink){page.drawText(clean(value),{x,y:A4[1]-at-size,size,font:b?bold:font,color});}
 const glyphWidths=new Map<string,number>();
 function wrap(value:unknown,w:number,size=9,face:PDFFont=font){
  const result:string[]=[];
  for(const source of clean(value).split('\n')){let row='',used=0;for(const ch of source){const key=(face===bold?'b':'r')+size+ch;let cw=glyphWidths.get(key);if(cw===undefined){cw=face.widthOfTextAtSize(ch,size);glyphWidths.set(key,cw);}if(row&&used+cw>w){const space=row.lastIndexOf(' ');if(space>0){result.push(row.slice(0,space));row=row.slice(space+1);used=face.widthOfTextAtSize(row,size);}else{result.push(row);row='';used=0;}}row+=ch;used+=cw;}result.push(row);}
  return result;
 }

 function rect(x:number,top:number,w:number,h:number,color= pale){page.drawRectangle({x,y:A4[1]-top-h,width:w,height:h,color});}
 function start(title:string){page=pdf.addPage(A4);rect(0,0,A4[0],91,ink);page.drawImage(logo,{x:margin,y:A4[1]-72,width:178,height:59});txt('K HOTEL SDN. BHD.',365,20,11,true,rgb(1,1,1));txt('Company No. 901651-W',365,38,8,false,rgb(.85,.85,.85));txt('KLG Campus Residence',365,52,8,false,rgb(.85,.85,.85));txt('Taman Sri Pulai, Skudai, Johor',365,66,8,false,rgb(.85,.85,.85));rect(0,91,A4[0],3,gold);txt('CHECK-OUT BATCH REPORT',margin,108,8,true,gold);txt(title,margin,127,20,true);txt(snapshot.batch.batch_no+' | '+batchDate(snapshot.batch.started_at)+' to '+batchDate(snapshot.batch.closed_at),margin,158,8);y=185;}
 function section(title:string){if(y>725)start(title+' - continued');txt(title,margin,y,11,true);y+=22;}
 function paragraph(value:unknown,size=9){for(const row of wrap(value,width,size)){if(y>772)start('Full details - continued');txt(row,margin,y,size);y+=size+4;}y+=7;}
 function table(heads:string[],rows:unknown[][],cols:number[],size=8.2){
  const heading=()=>{rect(margin,y,width,24,ink);let x=margin;heads.forEach((h,i)=>{txt(h,x+5,y+6,7.6,true,rgb(1,1,1));x+=cols[i];});y+=24;};
  if(y>730)start('Full details - continued');heading();
  for(const row of rows){const cells=row.map((v,i)=>wrap(v,cols[i]-10,size));let remaining=true,offset=0;while(remaining){const capacity=Math.max(1,Math.floor((775-y-10)/(size+3)));const chunk=cells.map(c=>c.slice(offset,offset+capacity));const length=Math.max(...chunk.map(c=>c.length),1),h=Math.max(23,length*(size+3)+10);if(y+h>780){start('Full details - continued');heading();continue;}rect(margin,y,width,h,pdf.getPageCount()%2?pale:rgb(.98,.98,.97));let x=margin;chunk.forEach((cell,i)=>{cell.forEach((v,n)=>txt(v,x+5,y+5+n*(size+3),size));x+=cols[i];});page.drawLine({start:{x:margin,y:A4[1]-y-h},end:{x:margin+width,y:A4[1]-y-h},thickness:.4,color:line});y+=h;offset+=length;remaining=cells.some(c=>c.length>offset);if(remaining){start('Full details - continued');heading();}}}
  if(!rows.length){txt('No records.',margin+6,y+8,9,false,gray);y+=31;}y+=15;
 }
 const summary=batchSummary(snapshot),totals=batchMaterialTotals(snapshot),moves=batchMovements(snapshot);
 start(kind==='summary'?'Batch summary':'Full batch details');
 if(kind==='summary'){
  const cards=[['ROOMS',summary.total+'','Ready: '+summary.ready],['MAINTENANCE',summary.repairRooms+' repair rooms',summary.defects+' defects'],['CLEANING',summary.cleaned+' completed','Removed records: '+summary.removed]];
  cards.forEach((v,i)=>{const x=margin+i*(width+9)/3;rect(x,y,(width-18)/3,64);txt(v[0],x+9,y+9,8,true,gray);txt(v[1],x+9,y+26,15,true);txt(v[2],x+9,y+48,8);});y+=80;
  txt('Closed by: '+s(snapshot.batch.closed_by_name)+' | '+batchDate(snapshot.batch.closed_at),margin,y,8,true);y+=25;
  // One A4 page: balance two columns, preserving every item and every unit.
  type SummaryLine={heading:string}|typeof totals[number];
  const entries:SummaryLine[]=[];
  for(const team of ['Maintenance','Cleaner','Office']){const items=totals.filter(t=>t.team===team);if(items.length)entries.push({heading:team},...items);}
  const middle=Math.ceil(entries.length/2),groups=[entries.slice(0,middle),entries.slice(middle)];
  if(groups[1].length&&!('heading' in groups[1][0])){const previous=entries.slice(0,middle).filter((e):e is {heading:string}=>'heading' in e).at(-1);groups[1].unshift({heading:(previous?.heading||'Materials')+' (continued)'});}
  const cellWidth=(width-16)/2;
  const height=(entry:SummaryLine,size:number)=>'heading' in entry?22:Math.max(20,wrap(entry.name+' ('+entry.unit+')',cellWidth-99,size).length*(size+1)+6);
  let size=8.2;while(size>6.8&&groups.some(g=>g.reduce((n,e)=>n+height(e,size),0)>760-y-23))size-=.2;
  if(groups.some(g=>g.reduce((n,e)=>n+height(e,size),0)>760-y-23))throw new Error('Too many distinct material lines for a readable one-page A4 summary. Please review duplicate inventory items before ending the batch.');
  for(let ci=0;ci<groups.length;ci++){
   const x=margin+ci*(width+16)/2,w=(width-16)/2;let yy=y;
   rect(x,yy,w,23,ink);txt('Item / unit',x+5,yy+7,7.3,true,rgb(1,1,1));txt('Out',x+w-83,yy+7,7.3,true,rgb(1,1,1));txt('Back',x+w-57,yy+7,7.3,true,rgb(1,1,1));txt('Net',x+w-27,yy+7,7.3,true,rgb(1,1,1));yy+=23;
   for(const entry of groups[ci]){const rowHeight=height(entry,size);rect(x,yy,w,rowHeight,pale);if('heading' in entry){txt(entry.heading,x+5,yy+5,8.5,true,gold);yy+=rowHeight;continue;}const t=entry,label=t.name+' ('+t.unit+')';const labelLines=wrap(label,w-99,size);labelLines.forEach((v,n)=>txt(v,x+4,yy+3+n*(size+1),size));txt(batchQuantity(t.quantity),x+w-83,yy+4,size);txt(batchQuantity(t.returned),x+w-57,yy+4,size);txt(batchQuantity(t.net),x+w-27,yy+4,size,true);yy+=rowHeight;}
   if(!groups[ci].length)txt('No recorded batch issues.',x+4,yy+10,8,false,gray);
  }
  txt('Net = recorded issues less recorded returns; unreturned stock is not independently confirmed consumption.',margin,773,7,false,gray);
 }else{
  paragraph('Closed by: '+s(snapshot.batch.closed_by_name)+' | '+batchDate(snapshot.batch.closed_at)+'\nClosing note: '+s(snapshot.batch.closing_note||'None')+'\n'+summary.total+' rooms; '+summary.ready+' ready; '+summary.removed+' removed records retained.');
  section('Room completion register');table(['Room','Maintenance','Cleaner','Ready / status'],snapshot.rooms.map(r=>[batchRoomLabel(r)+(r.deleted_at?' (removed)':''),s(r.maintenance_name),s(r.cleaner_name),batchDate(r.ready_at)+'\n'+r.status]),[60,125,125,width-310]);
  for(const team of ['Maintenance','Cleaner','Office']){const rows=totals.filter(t=>t.team===team);if(!rows.length)continue;section(team+' material totals');table(['Item / unit','Issued','Returned','Net'],rows.map(t=>[t.code+' | '+t.name+'\n'+t.unit,batchQuantity(t.quantity),batchQuantity(t.returned),batchQuantity(t.net)]),[width-165,55,55,55]);}
  paragraph('Only attributed batch issues are included. General stock-outs with other or unrecorded purposes are excluded. Net means issued less recorded returns. A stock-out entered directly by an administrator has no separate request / approval record.');
  start('Material movement ledger');table(['Item / source','Room / recipient','Issued / returned','Recorded by / date'],moves.map(m=>[m.code+' | '+m.name+'\n'+m.source+' #'+m.id,m.roomId?batchRoomLabel(snapshot.rooms.find(r=>r.id===m.roomId)!)+'\n'+m.recipient:'Batch stock\n'+m.recipient,batchQuantity(m.quantity)+' '+m.unit+'\nReturned '+batchQuantity(m.returned)+'; net '+batchQuantity(m.net),m.actor+'\n'+batchDate(m.date)+(m.note?'\n'+m.note:'')]),[150,105,105,width-360]);
  section('Recorded returns');table(['Item / source','Returned','Returned by','Received by / date / reason'],snapshot.returns.map(r=>[s(r.inventory_item_id)+'\n'+(r.issue_id?'Issue #'+r.issue_id:'Stock-out #'+r.adjustment_id),s(r.qty),s(r.returned_by),s(r.received_by_name)+'\n'+batchDate(r.created_at)+'\n'+s(r.note)]),[155,55,95,width-305]);
  start('Material requests and approvals');
  for(const request of snapshot.requests){section(s(request.request_no));paragraph('Room: '+batchRoomLabel(snapshot.rooms.find(r=>r.id===request.checkout_room_id)!)+' | Status: '+s(request.status)+'\nRequested by '+s(request.requested_by_name)+' at '+batchDate(request.created_at)+'\nReview: '+s(request.reviewed_by_name)+' at '+batchDate(request.reviewed_at)+'\nNotes: '+s(request.note||'None')+' | Rejection / closure: '+s(request.rejection_reason||'None'));
   table(['Material','Requested / approved','Issued','Decision / approver'],snapshot.request_items.filter(i=>i.request_id===request.id).map(i=>[s(i.item_code)+' | '+s(i.description)+'\nUnit: '+s(i.unit),s(i.requested_qty)+' / '+s(i.approved_qty??0),s(i.issued_qty??0),s(i.line_status)+' | '+s(i.approved_by_name)+'\n'+batchDate(i.approved_at)+'\n'+s(i.decision_reason||'')]),[170,110,50,width-330]);
   const decisions=snapshot.decisions.filter(d=>d.request_id===request.id);if(decisions.length)table(['Action / actor / date','Reason','Before / after'],decisions.map(d=>[s(d.action)+' | '+s(d.actor_name)+'\n'+batchDate(d.created_at),s(d.reason),s(d.old_values)+'\n'+s(d.new_values)]),[155,135,width-290],7.5);
  }
  for(const room of snapshot.rooms){
   start(batchRoomLabel(room)+' | Room details');paragraph(room.reference_no+' | '+room.status+(room.deleted_at?' | Removed: '+batchDate(room.deleted_at):'')+'\nCreated: '+batchDate(room.created_at)+' | By: '+s(room.created_by_name)+'\nMaintenance: '+s(room.maintenance_name)+' | Cleaner: '+s(room.cleaner_name)+'\nReady: '+batchDate(room.ready_at)+' | Pax: '+s(room.occupancy_pax)+'\nUTMSPACE defects: '+s(room.utmspace_defects)+'\nInspection notes: '+s(room.inspection_notes||'None')+(room.deletion_reason?'\nRemoval reason: '+s(room.deletion_reason):''));
   section('Inspection checklist');
   const checklist=room.inspection_checklist;
   if(!checklist)paragraph('No digital checklist was recorded for this historical room. The defect register and original history follow.');
   else {paragraph('Date: '+s(checklist.date)+' | Inspector: '+s(checklist.by)+' | Reason: '+s(checklist.reason||'Not recorded'));
    const checkRows:unknown[][]=[];
    if(Array.isArray(checklist.items)){const names=['Divan','Mattress','Chair','Wardrobe','Bookshelf'];checklist.items.forEach((owners,ci)=>{if(Array.isArray(owners))owners.forEach((item,oi)=>{if(item&&typeof item==='object'){const v=item as Record<string,unknown>;checkRows.push([names[ci]+' / '+(oi?'UTMSPACE':'KLGCR'),v.enabled===false?'Not applicable':s(v.status),s(v.qty??''),s(v.defects||v.remark||'')]);}});});}
    if(checklist.fac&&typeof checklist.fac==='object')for(const [name,item]of Object.entries(checklist.fac)){const v=item as Record<string,unknown>;checkRows.push([name,s(v.status),s(v.qty??''),s(v.type||'')+' '+s(v.remark||'')]);}
    if(checklist.it&&typeof checklist.it==='object')for(const [key,qty]of Object.entries(checklist.it)){const [ci,si]=key.split('.').map(Number),detail=(checklist.dt as Record<string,unknown>|undefined)?.[key];checkRows.push([CD_CATEGORIES[ci]?.[0]+' / '+(CD_CATEGORIES[ci]?.[1]?.[si]?.[0]||key),Number(qty)>0?'Defect':'Checked / normal',qty,s(detail||((checklist.nt as Record<string,unknown>|undefined)?.[ci])||'')]);}
    if(checkRows.length)table(['Checked item','Original result','Qty','Remark / finding'],checkRows,[155,95,40,width-290]);
   }
   section('Defect register');table(['Defect / source','Status','Rectified by / at'],snapshot.defects.filter(d=>d.checkout_room_id===room.id).map(d=>[checkoutPdfDefectTitle({description:d.description,utmspace_pdf_source:d.utmspace_pdf_source})+'\n'+s(d.source),s(d.status),s(d.rectified_by_name)+'\n'+batchDate(d.rectified_at)]),[width-220,80,140]);
   section('Complete work history');table(['Date / person','Action / status change','Notes / action taken'],snapshot.history.filter(h=>h.checkout_room_id===room.id).map(h=>[batchDate(h.created_at)+'\n'+s(h.actor_name),s(h.action)+'\n'+s(h.from_status||'')+' > '+s(h.to_status||''),s(h.notes||'No note recorded')]),[125,140,width-265]);
   const tasks=snapshot.painting.filter(p=>p.checkout_room_id===room.id);if(tasks.length){section('General worker / painting');table(['Worker / dates','Area / reason','Status / notes'],tasks.map(t=>[s(t.worker_name)+'\n'+s(t.work_date)+'\nCompleted: '+batchDate(t.completed_at),s(t.area)+'\n'+s(t.reasons),s(t.status)+'\n'+s(t.notes||'')]),[150,150,width-300]);}
   section('Materials issued for this room');const rm=moves.filter(m=>m.roomId===room.id);table(['Material','Issued / returned / net','Recipient / date'],rm.map(m=>[m.code+' | '+m.name,batchQuantity(m.quantity)+' / '+batchQuantity(m.returned)+' / '+batchQuantity(m.net)+' '+m.unit,m.recipient+'\n'+batchDate(m.date)]),[200,150,width-350]);
   paragraph('Batch stock-outs are listed in the material movement ledger. No room allocation is inferred when the original issue did not specify a room.');
   const photos=snapshot.photos.filter(p=>p.checkout_room_id===room.id);
   if(!photos.length){section('Photo evidence');paragraph('No photos recorded for this room.');}
   else {
    start(batchRoomLabel(room)+' | Photo evidence');
    for(let offset=0;offset<photos.length;offset+=4){if(offset>0)start(batchRoomLabel(room)+' | Photos continued');const group=photos.slice(offset,offset+4);const bytes=await Promise.all(group.map(p=>{if(!loadPhoto)throw new Error('A photo loader is required for complete reports');return loadPhoto(p);}));
     for(let i=0;i<group.length;i++){const photo=group[i],image=await pdf.embedJpg(bytes[i]),x=margin+(i%2)*(width+12)/2,top=190+Math.floor(i/2)*290,w=(width-12)/2,h=222,scale=Math.min(w/image.width,h/image.height);rect(x,top,w,h,pale);page.drawImage(image,{x:x+(w-image.width*scale)/2,y:A4[1]-top-h+(h-image.height*scale)/2,width:image.width*scale,height:image.height*scale});txt(s(photo.kind).replaceAll('_',' ')+' | '+batchDate(photo.created_at),x,top+h+7,7);const caption=wrap('By '+s(photo.uploaded_by_name)+' | Photo '+s(photo.id),w,7);caption.forEach((v,n)=>txt(v,x,top+h+20+n*9,7));}
    }
   }
  }
 }
 for(const [i,p]of pdf.getPages().entries()){page=p;txt(snapshot.batch.batch_no+' | '+(kind==='summary'?'SUMMARY':'FULL DETAILS')+' | MYT',margin,802,7,false,gray);txt((i+1)+' / '+pdf.getPageCount(),522,802,8,false,gray);}
 if(kind==='summary'&&pdf.getPageCount()!==1)throw new Error('Summary must fit one A4 page');
 return pdf.save();
}
