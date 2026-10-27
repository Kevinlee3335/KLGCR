import { PDFDocument, StandardFonts, rgb, setCharacterSpacing, setWordSpacing, setCharacterSqueeze } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { smoothSignatureStroke } from './signature-drawing';
import type { PurchaseOrder } from './schema';

export async function purchaseOrderPdf(order: PurchaseOrder) {
  const pdf = await PDFDocument.create();
  const source = await PDFDocument.load(await readFile(path.join(process.cwd(), 'src/lib/purchase-orders/template.pdf')));
  // Embed only the original letterhead and title; old PO data is never copied.
  const header = await pdf.embedPage(source.getPage(0), { left: 0, bottom: 660, right: 595.3, top: 841.9 });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const clean = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff\n]/g, '?');
  const wrap = (text: string, width: number, size = 11) => {
    const lines: string[] = [];
    for (const paragraph of clean(text).split('\n')) {
      let line = '';
      for (const char of paragraph) {
        if (font.widthOfTextAtSize(line + char, size) > width) { lines.push(line); line = ''; }
        line += char;
      }
      lines.push(line);
    }
    return lines;
  };
  const edges = [18.5, 49.7, 256.7, 378.3, 463.8, 576.1];
  let page = pdf.addPage([595.3, 841.9]);
  const text = (value: string, x: number, top: number, size = 11, heavy = false) => { page.pushOperators(setCharacterSpacing(0), setWordSpacing(0), setCharacterSqueeze(100)); page.drawText(clean(value), { x, y: 841.9-top-size, size, font: heavy ? bold : font }); };
  const line = (x1: number, top1: number, x2: number, top2: number) => page.drawLine({ start: { x:x1, y:841.9-top1 }, end:{ x:x2, y:841.9-top2 }, thickness:0.5, color:rgb(0,0,0) });
  const start = () => {
    page.drawPage(header, { x:0, y:660 });
    text('PO NO',24.3,205.9,14,true); text(`: ${order.po_no}`,97,205.9,14,true);
    const d = new Date(order.order_date+'T12:00:00Z'); const day=d.getUTCDate();
    const suffix=day%100>=11&&day%100<=13?'th':({1:'st',2:'nd',3:'rd'}[day%10]||'th');
    text('DATE',24.3,235.2,14,true); text(`: ${String(day).padStart(2,'0')}${suffix} ${d.toLocaleString('en-GB',{month:'long',timeZone:'UTC'}).toUpperCase()} ${d.getUTCFullYear()}`,97,235.2,14,true);
    const labels=['NO','ITEM\nDESCRIPTION','SPECIFICATION','QUANTITY','LOCATION'];
    for(let i=0;i<5;i++) {
      const parts=labels[i].split('\n');
      parts.forEach((s,j)=>text(s,(edges[i]+edges[i+1]-bold.widthOfTextAtSize(s,12))/2,285+j*25,12,true));
      line(edges[i],270,edges[i],334);
    }
    line(edges[5],270,edges[5],334); line(edges[0],270,edges[5],270); line(edges[0],334,edges[5],334);
  };
  start(); let top=334;
  order.items.forEach((item,index)=>{
    const columns=[`${index+1}.`,`${item.code}\n${item.description}`,item.specification,`${item.quantity}${item.unit?' '+item.unit:''}`,item.location];
    const lines=columns.map((c,i)=>wrap(c,edges[i+1]-edges[i]-12));
    const height=Math.max(52, Math.max(...lines.map(a=>a.length))*14+14);
    if(top+height>615){text(`Continued - ${order.po_no}`,24,805,9);page=pdf.addPage([595.3,841.9]);start();top=334;}
    for(let i=0;i<5;i++){line(edges[i],top,edges[i],top+height);lines[i].forEach((s,j)=>text(s,edges[i]+6,top+5+j*14,i===1&&j===0?8:11));}
    line(edges[5],top,edges[5],top+height);line(edges[0],top+height,edges[5],top+height);top+=height;
  });
  for(const [x,label,name,date] of [[50.5,'Requested by:',order.requested_by,new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur'}).format(new Date(order.requested_at||order.created_at))],[375,'Approved By:',order.approved_at?order.approved_by:'Pending approval',order.approved_at?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur'}).format(new Date(order.approved_at)):'']] as const){
    text(label,x,631.7,14);text(`Name: ${name}`,x,653.7,12);text(`Date: ${date}`,x,675.7,12);
  }
  const time=(value:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuala_Lumpur',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));
  text(`Time: ${time(order.requested_at||order.created_at)} MYT`,50.5,697.7,11);
  if(order.approved_at)text(`Time: ${time(order.approved_at)} MYT`,375,697.7,11);
  for(const [x,signature] of [[50.5,order.requested_signature],[375,order.approved_signature]] as const){
    line(x,774,x+165,774);
    if(signature)for(const stroke of signature.strokes){const points=smoothSignatureStroke(stroke);for(let i=1;i<points.length;i++)line(x+points[i-1][0]*165,721+points[i-1][1]*48,x+points[i][0]*165,721+points[i][1]*48);}
  }
  pdf.setTitle(order.po_no); pdf.setCreationDate(new Date(order.created_at));
  return pdf.save();
}
