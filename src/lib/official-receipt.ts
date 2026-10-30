import fontkit from "@pdf-lib/fontkit";
import {PDFDocument,rgb} from 'pdf-lib';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
export type OfficialReceipt={id:string;receipt_no:string;kind:string;paid_on:string;payer:string;email:string;amount:number;description:string;bank_reference:string;proof_path:string|null;emailed_at:string|null;email_error:string|null};
const small=['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
export function amountWords(value:number):string{
 const whole=(n:number):string=>n<20?small[n]:n<100?['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'][Math.floor(n/10)]+(n%10?' '+whole(n%10):''):n<1000?whole(Math.floor(n/100))+' Hundred'+(n%100?' '+whole(n%100):''):n<1000000?whole(Math.floor(n/1000))+' Thousand'+(n%1000?' '+whole(n%1000):''):whole(Math.floor(n/1000000))+' Million'+(n%1000000?' '+whole(n%1000000):'');
 const cents=Math.round(value*100);return whole(Math.floor(cents/100))+' Ringgit'+(cents%100?' and '+whole(cents%100)+' Sen':'')+' Only';
}
export const receiptNote='Note: If payment is by bank transfer, this receipt shall only be valid upon clearance of the bank transfer.';
export async function financialPdf(input:{receipt?:OfficialReceipt;title?:string;lines?:string[]}){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const [regularBytes,boldBytes]=await Promise.all([readFile(join(process.cwd(),'src/lib/finance-fonts/regular.ttf')),readFile(join(process.cwd(),'src/lib/finance-fonts/bold.ttf'))]);const font=await pdf.embedFont(regularBytes,{subset:true}),bold=await pdf.embedFont(boldBytes,{subset:true}),navy=rgb(.04,.10,.24);
 let page=pdf.addPage([842,595]),y=555;
 const clean=(s:string)=>s.replace(/[^\x20-\x7E\u00A0-\u00FF]/g,'-');
 function text(s:string,x:number,at:number,size=12,strong=false){page.drawText(clean(s),{x,y:at,size,font:strong?bold:font,color:navy})}
 function wrap(s:string,width:number,size=13){const out:string[]=[];let line='';for(const word of clean(s).split(/\s+/)){const candidate=line?line+' '+word:word;if(font.widthOfTextAtSize(candidate,size)>width&&line){out.push(line);line=word}else line=candidate;}if(line)out.push(line);return out;}
 // Original letterhead extracted from the supplied company letter. Preserve pixels and aspect ratio.
 const letterhead=await pdf.embedPng(await readFile(join(process.cwd(),'public/billing/receipt-letterhead.png')));page.drawImage(letterhead,{x:71,y:448,width:700,height:700*letterhead.height/letterhead.width});
 y=421;text(input.receipt?'OFFICIAL RECEIPT':input.title||'STATEMENT OF ACCOUNT',42,y,22,true);y-=38;
 if(input.receipt){const r=input.receipt;text('No: '+r.receipt_no,580,425,14,true);text('Date: '+r.paid_on.split('-').reverse().join('/'),580,402,13);
 for(const [label,value] of [['Received From',r.payer],['The Sum of RM',amountWords(Number(r.amount))+' (RM '+Number(r.amount).toFixed(2)+')'],['Being Payment Of',r.description]]){text(label+' :',42,y,14,true);const rows=wrap(value,570);for(const row of rows){if(y<160){page=pdf.addPage([842,595]);y=545;}text(row,210,y,13);y-=19;}page.drawLine({start:{x:210,y:y+10},end:{x:800,y:y+10},thickness:.5,color:navy});y-=24;}
 if(y<155){page=pdf.addPage([842,595]);}
 text('BANK TRANSFER',42,119,14,true);text('Reference: '+(r.bank_reference||'-'),42,94,12);page.drawLine({start:{x:570,y:94},end:{x:800,y:94},thickness:.7,color:navy});text('Authorised Signature',620,74,12,true);text(receiptNote,42,34,10);
 }else{for(const raw of input.lines||[]){for(const line of wrap(raw,750,12)){if(y<55){page=pdf.addPage([842,595]);y=550;}text(line,42,y,12);y-=19;}y-=7;}}
 return Buffer.from(await pdf.save());
}
