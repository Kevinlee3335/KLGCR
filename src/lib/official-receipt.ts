import {signaturePhotoBounds} from './signature-image-layout';
import {companySealDataUrl} from './company-seal';
import fontkit from "@pdf-lib/fontkit";
import {PDFDocument,rgb} from 'pdf-lib';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
export type OfficialReceipt={issuer_signature?:{imageDataUrl?:string;strokes?:number[][][]}|null;id:string;receipt_no:string;kind:string;paid_on:string;payer:string;email:string;amount:number;description:string;bank_reference:string;proof_path:string|null;emailed_at:string|null;email_error:string|null};
const small=['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
export function amountWords(value:number):string{
 const whole=(n:number):string=>n<20?small[n]:n<100?['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'][Math.floor(n/10)]+(n%10?' '+whole(n%10):''):n<1000?whole(Math.floor(n/100))+' Hundred'+(n%100?' '+whole(n%100):''):n<1000000?whole(Math.floor(n/1000))+' Thousand'+(n%1000?' '+whole(n%1000):''):whole(Math.floor(n/1000000))+' Million'+(n%1000000?' '+whole(n%1000000):'');
 const cents=Math.round(value*100);return whole(Math.floor(cents/100))+' Ringgit'+(cents%100?' and '+whole(cents%100)+' Sen':'')+' Only';
}
export const receiptNote='Note: If payment is by bank transfer, this receipt shall only be valid upon clearance of the bank transfer.';
export const financePaperSizes = {
 a4: [595.2755906, 841.8897638] as [number, number],
 a5Landscape: [595.2755906, 419.5275591] as [number, number],
};
export async function financialPdf(input:{receipt?:OfficialReceipt;title?:string;lines?:string[]}){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const [regularBytes,boldBytes]=await Promise.all([readFile(join(process.cwd(),'src/lib/finance-fonts/regular.ttf')),readFile(join(process.cwd(),'src/lib/finance-fonts/bold.ttf'))]);const font=await pdf.embedFont(regularBytes,{subset:true}),bold=await pdf.embedFont(boldBytes,{subset:true}),navy=rgb(.04,.10,.24);
 let page=pdf.addPage(input.receipt?[842,595]:financePaperSizes.a4),y=input.receipt?555:802;
 const clean=(s:string)=>s.replace(/[^\x20-\x7E\u00A0-\u00FF]/g,'-');
 function text(s:string,x:number,at:number,size=12,strong=false){page.drawText(clean(s),{x,y:at,size,font:strong?bold:font,color:navy})}
 function wrap(s:string,width:number,size=13){const out:string[]=[];let line='';for(const word of clean(s).split(/\s+/)){const candidate=line?line+' '+word:word;if(font.widthOfTextAtSize(candidate,size)>width&&line){out.push(line);line=word}else line=candidate;}if(line)out.push(line);return out;}
 // Original letterhead extracted from the supplied company letter. Preserve pixels and aspect ratio.
 const letterhead=await pdf.embedPng(await readFile(join(process.cwd(),'public/billing/receipt-letterhead.png')));const headerWidth=input.receipt?700:511;
 page.drawImage(letterhead,{x:input.receipt?71:42,y:input.receipt?448:695,width:headerWidth,height:headerWidth*letterhead.height/letterhead.width});
 y=input.receipt?421:660;text(input.receipt?'OFFICIAL RECEIPT':input.title||'STATEMENT OF ACCOUNT',42,y,22,true);y-=38;
 if(input.receipt){const r=input.receipt;text('No: '+r.receipt_no,580,425,14,true);text('Date: '+r.paid_on.split('-').reverse().join('/'),580,402,13);
 for(const [label,value] of [['Received From',r.payer],['The Sum of RM',amountWords(Number(r.amount))+' (RM '+Number(r.amount).toFixed(2)+')'],['Being Payment Of',r.description]]){text(label+' :',42,y,14,true);const rows=wrap(value,570);for(const row of rows){if(y<160){page=pdf.addPage([842,595]);y=545;}text(row,210,y,13);y-=19;}page.drawLine({start:{x:210,y:y+10},end:{x:800,y:y+10},thickness:.5,color:navy});y-=24;}
 if(y<155){page=pdf.addPage([842,595]);}
 text('BANK TRANSFER',42,119,14,true);text('Reference: '+(r.bank_reference||'-'),42,94,12);if (r.issuer_signature) {
   const signature = r.issuer_signature;
   if (signature.imageDataUrl) {
     const ink = await pdf.embedPng(signature.imageDataUrl);
     const bounds=signaturePhotoBounds(signature.imageDataUrl);
     const scale=Math.min(144/bounds.width,52/bounds.height);
     const bottom=bounds.imageHeight-bounds.top-bounds.height;
     page.drawImage(ink,{x:580+72-(bounds.left+bounds.width/2)*scale,y:97-bottom*scale,width:bounds.imageWidth*scale,height:bounds.imageHeight*scale});
   } else {
     for (const stroke of signature.strokes || []) {
       for (let i=1; i<stroke.length; i++) {
         const point=(p:number[])=>({x:580+p[0]*144,y:149-p[1]*52});
         page.drawLine({start:point(stroke[i-1]),end:point(stroke[i]),thickness:1.2});
       }
     }
   }
   const seal = await pdf.embedPng(companySealDataUrl);
   page.drawImage(seal,{x:739,y:97,width:54,height:54});
 }
 page.drawLine({start:{x:570,y:94},end:{x:800,y:94},thickness:.7,color:navy});text('Authorised Signature',620,74,12,true);text(receiptNote,42,34,10);
 }else{for(const raw of input.lines||[]){for(const line of wrap(raw,511,12)){if(y<55){page=pdf.addPage(financePaperSizes.a4);y=802;}text(line,42,y,12);y-=19;}y-=7;}}
 if(input.receipt){
   const receiptPdf=await PDFDocument.create();
   for(const source of pdf.getPages()){
     const embedded=await receiptPdf.embedPage(source);
     const target=receiptPdf.addPage(financePaperSizes.a5Landscape);
     const scale=Math.min(target.getWidth()/source.getWidth(),target.getHeight()/source.getHeight());
     target.drawPage(embedded,{x:(target.getWidth()-source.getWidth()*scale)/2,y:(target.getHeight()-source.getHeight()*scale)/2,width:source.getWidth()*scale,height:source.getHeight()*scale});
   }
   return Buffer.from(await receiptPdf.save());
 }
 return Buffer.from(await pdf.save());
}
