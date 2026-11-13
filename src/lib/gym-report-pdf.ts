import fontkit from '@pdf-lib/fontkit';
import {PDFDocument,rgb,type PDFFont} from 'pdf-lib';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {financePaperSizes} from './official-receipt';
import {companySealDataUrl} from './company-seal';
import {signaturePhotoBounds} from './signature-image-layout';
import {signatureSchema,type Signature} from './purchase-orders/signature';
import type {Verification} from './document-review';
import {documentVerificationSlots} from './document-review-status';
import type {CommitteeReport} from './committee-report';
import type {PaymentListRow} from './membership-payment-list';

type ReportInput={
 kind:string;month:string;snapshot:CommitteeReport|PaymentListRow[];
 approved_at?:string|null;signature?:Signature;verifications?:Verification[];
};
export async function gymReportPdf(input:ReportInput){
 const pdf=await PDFDocument.create();
 pdf.registerFontkit(fontkit);
 const [regular,boldBytes,letterhead]=await Promise.all([
 readFile(join(process.cwd(),'src/lib/finance-fonts/regular.ttf')),
 readFile(join(process.cwd(),'src/lib/finance-fonts/bold.ttf')),
 readFile(join(process.cwd(),'public/billing/receipt-letterhead.png'))
 ]);
 const font=await pdf.embedFont(regular,{subset:true});
 const bold=await pdf.embedFont(boldBytes,{subset:true});
 const logo=await pdf.embedPng(letterhead);
 const navy=rgb(.04,.10,.24),gold=rgb(.96,.93,.85),line=rgb(.45,.45,.45);
 const title=input.kind==='committee'?'Sports Committee Report':'Monthly Payment List';
 const month=new Date(input.month.slice(0,7)+'-01T12:00:00Z').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'Asia/Kuala_Lumpur'});
 const money=(n:number|null)=>n==null?'—':Number(n).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
 const clean=(s:string)=>s.replace(/[^\x20-\x7E\u00A0-\u00FF]/g,'-');
 let page=pdf.addPage(financePaperSizes.a4),y=0;
 const margin=36,width=page.getWidth()-margin*2;
 const columns=input.kind==='committee'?[28,width-143,115]:[26,58,90,166,103,width-443];
 const headers=input.kind==='committee'?['No.','Full name','Collection (RM)']:['No.','Date','Receipt No.','Full name','Room / Member No.','Amount (RM)'];
 function text(value:string,x:number,at:number,size=9,strong=false){
   page.drawText(clean(value),{x,y:at,size,font:strong?bold:font,color:navy});
 }
 function wrap(value:string,available:number,face:PDFFont,size:number){
   const rows:string[]=[];let current='';
   for(const char of clean(value)){
     if(current&&face.widthOfTextAtSize(current+char,size)>available){rows.push(current);current='';}
     current+=char;
   }
   rows.push(current);return rows;
 }
 function row(values:string[],heading=false){
   const size=heading?8:9,face=heading?bold:font;
   const cells=values.map((value,i)=>wrap(value,columns[i]-10,face,size));
   const height=Math.max(26,...cells.map(c=>c.length*12+12));
   let x=margin;
   cells.forEach((cell,i)=>{
     page.drawRectangle({x,y:y-height,width:columns[i],height,borderWidth:.55,borderColor:line,...(heading?{color:gold}:{})});
     cell.forEach((value,n)=>text(value,x+5,y-15-n*12,size,heading));
     x+=columns[i];
   });
   y-=height;return height;
 }
 function start(continuation=false){
   if(continuation)page=pdf.addPage(financePaperSizes.a4);
   const top=page.getHeight();
   page.drawImage(logo,{x:margin,y:top-120,width,height:width*logo.height/logo.width});
   text(title,margin,top-151,18,true);
   text(month+(continuation?' · Continued':''),margin,top-175,11);
   y=top-197;
 }
 start();
 let rows:string[][]=[],total=0;
 if(input.kind==='committee'){
   const report=input.snapshot as CommitteeReport;
   text('Members '+report.member_count+' | Collection RM '+money(report.total_amount)+' | Committee payable RM '+money(report.remuneration),margin,y,10,true);
   y-=22;total=Number(report.total_amount);
   rows=report.entries.map((entry,i)=>[String(i+1),entry.full_name,money(entry.amount)]);
 }else{
   const entries=input.snapshot as PaymentListRow[];
   total=entries.reduce((n,e)=>n+Number(e.amount||0),0);
   text(entries.length+' entries | Total collection RM '+money(total),margin,y,10,true);
   y-=22;
   rows=entries.map((entry,i)=>[String(i+1),entry.collected_on.slice(8,10)+'/'+entry.collected_on.slice(5,7)+'/'+entry.collected_on.slice(0,4),entry.receipt_no||'-',entry.full_name,entry.member_reference||'-',money(entry.amount)]);
 }
 row(headers,true);
 for(const values of rows){
   const height=Math.max(26,...values.map((v,i)=>wrap(v,columns[i]-10,font,9).length*12+12));
   if(y-height<60){start(true);row(headers,true);}
   row(values);
 }
 if(y<100){start(true);row(headers,true);}
 row(headers.map((_,i)=>i===1?'TOTAL':i===headers.length-1?money(total):''),true);

   if(y<225)start(true);
   y-=34;
   const verified=input.verifications||[];
   const [fikri,kevin]=documentVerificationSlots(verified);
   const slots=[{label:'Verified by Fikri',date:fikri?.verified_at,signature:fikri?.signature},{label:'Verified by Kevin',date:kevin?.verified_at,signature:kevin?.signature},{label:'Approved by James',date:input.approved_at,signature:input.approved_at?input.signature:undefined}];
   const cellWidth=width/3;
   for(const [i,slot] of slots.entries()){
     const x=margin+i*cellWidth,parsed=signatureSchema.safeParse(slot.signature);
     const sig=parsed.success?parsed.data:null;
     text(slot.label,x,y,10,true);
     const inkY=y-78;
     if(sig?.imageDataUrl){
       const bounds=signaturePhotoBounds(sig.imageDataUrl),ink=await pdf.embedPng(sig.imageDataUrl);
       const scale=Math.min(108/bounds.width,55/bounds.height);
       const drawX=x+54-(bounds.left+bounds.width/2)*scale;
       const bottom=bounds.imageHeight-bounds.top-bounds.height;
       page.drawImage(ink,{x:drawX,y:inkY-bottom*scale,width:bounds.imageWidth*scale,height:bounds.imageHeight*scale});
     }else if(sig)for(const stroke of sig.strokes)for(let n=1;n<stroke.length;n++){
       const pt=(p:number[])=>({x:x+p[0]*108,y:inkY+55-p[1]*55});
       page.drawLine({start:pt(stroke[n-1]),end:pt(stroke[n]),thickness:1.2});
     }
     if(i===slots.length-1&&sig&&input.approved_at)page.drawImage(await pdf.embedPng(companySealDataUrl),{x:x+113,y:inkY,width:44,height:44});
     page.drawLine({start:{x,y:inkY-7},end:{x:x+cellWidth-14,y:inkY-7},thickness:.6,color:line});
     text(slot.date?new Date(slot.date).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur'})+' MYT':'Pending',x,inkY-22,7);
   }
 for(const [i,p] of pdf.getPages().entries())p.drawText((i+1)+' / '+pdf.getPageCount(),{x:page.getWidth()-64,y:22,size:8,font,color:navy});
 return Buffer.from(await pdf.save());
}
