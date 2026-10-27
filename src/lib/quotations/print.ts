import {lineAmount,totalAmount,type Quotation} from './model';
import template from './excel-template.json';
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const money=(n:number)=>n.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
function amountWords(n:number):string {
 const one=['ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
 const tens=['','','TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'];
 if(n<20)return one[n];if(n<100)return tens[Math.floor(n/10)]+(n%10?' '+one[n%10]:'');
 for(const [unit,label] of [[1e9,'BILLION'],[1e6,'MILLION'],[1000,'THOUSAND'],[100,'HUNDRED']] as const)if(n>=unit)return amountWords(Math.floor(n/unit))+' '+label+(n%unit?' '+amountWords(n%unit):'');
 return '';
}
function words(n:number){const cents=Math.round(n*100);return 'RINGGIT MALAYSIA '+amountWords(Math.floor(cents/100))+(cents%100?' AND CENTS '+amountWords(cents%100):'')+' ONLY'}
function dateText(s:string){const d=new Date(s+'T00:00:00Z'),day=d.getUTCDate();return day+((day%100>=11&&day%100<=13)?'th':day%10===1?'st':day%10===2?'nd':day%10===3?'rd':'th')+' '+d.toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'})}
function originalSheet(q:Quotation){
 const item=q.items[0],address=q.address.split('\n');
 const values:Record<string,string>={A13:q.customer,A14:address[0]||'',A15:address[1]||'',A16:address.slice(2).join('\n'),L13:'QT '+q.number,L14:dateText(q.date),L15:'1 of 1',D19:q.attention,D21:q.phone,D23:q.email,A25:q.salutation,A29:q.introduction,D31:q.quantityHeading,B33:item.description,D33:item.quantity+' '+item.unit,G33:'RM '+money(item.price),J33:'RM '+money(lineAmount(item)),A35:words(totalAmount(q)),A36:q.note,D38:q.paymentTerms,D39:q.paymentMethod,A41:q.validity};
 const broad:Record<string,number>={A13:template.width*.56,A14:template.width*.56,A15:template.width*.56,A16:template.width*.56,D19:template.width*.7,D21:template.width*.7,D23:template.width*.7,A25:template.width,A35:template.width,A36:template.width,D38:template.width*.7,A41:template.width,A42:template.width,A47:template.width,A49:template.width};
 let svg='';
 for(const cell of template.cells){
  // The preprinted letterhead owns the whole area above QUOTATION.
  if(Number(cell.ref.replace(/[A-Z]/g,''))<11 || Number(cell.ref.replace(/[A-Z]/g,''))>=47)continue;
  const {x,y,w,h}=cell;
  for(const edge of Object.keys(cell.edges)){
   const p=edge==='top'?[x,y,x+w,y]:edge==='bottom'?[x,y+h,x+w,y+h]:edge==='left'?[x,y,x,y+h]:edge==='right'?[x+w,y,x+w,y+h]:null;
   if(p)svg+=`<line x1="${p[0]}" y1="${p[1]}" x2="${p[2]}" y2="${p[3]}" stroke="black" stroke-width="1"/>`;
  }
  const value=values[cell.ref]??cell.text;if(!value)continue;
  const label=['A38','A39'].includes(cell.ref),single=label||['L13','L14','L15','D38'].includes(cell.ref);
  const width=label?template.width*.25:broad[cell.ref]??w, max=single?10000:Math.max(4,Math.floor((width-8)/(cell.size*(cell.ref==='D39'?.6:.49)))),lines:string[]=[];
  for(const raw of value.split('\n')){let line='';for(const word of raw.split(' ')){if(line&&line.length+word.length+1>max){lines.push(line);line=word}else line+=(line?' ':'')+word}lines.push(line)}
  const leading=cell.size*1.16, start=cell.vertical==='center'?y+(h-lines.length*leading)/2+cell.size:cell.vertical==='top'?y+cell.size+2:y+h-3-(lines.length-1)*leading;
  const anchor=cell.align==='center'?'middle':cell.align==='right'?'end':'start',tx=anchor==='middle'?x+width/2:anchor==='end'?x+width-3:x+3;
  const fallback=cell.font==='Times New Roman'?'serif':'sans-serif';
  svg+=`<text x="${tx}" y="${start}" font-family="${esc(cell.font)},${fallback}" font-size="${cell.size}" ${cell.bold?'font-weight="bold"':''} text-anchor="${anchor}">${lines.map((line,i)=>`<tspan x="${tx}" dy="${i?leading:0}"${single&&line.length*cell.size*.55>width-8?` font-size="${(width-8)/(line.length*.55)}" textLength="${width-8}" lengthAdjust="spacingAndGlyphs"`:''}>${esc(line)}</tspan>`).join('')}</text>`;
 }
 for(const [x,label,name,date,signature] of [[3,'Prepared By',q.createdBy,q.createdAt,q.preparedSignature],[550,'Approved By',q.approvedBy||'Pending approval',q.approvedAt,q.approvedSignature]] as const){
  svg+=`<g font-family="Calibri,sans-serif" font-size="16"><text x="${x}" y="1140" font-weight="bold">${label}</text>`;
  if(signature)for(const stroke of signature.strokes)svg+=`<polyline points="${stroke.map(([px,py])=>`${x+px*350},${1160+py*75}`).join(' ')}" fill="none" stroke="black" stroke-width="2.4"/>`;
  svg+=`<line x1="${x}" y1="1248" x2="${x+350}" y2="1248" stroke="black"/><text x="${x}" y="1275">${esc(name)}</text><text x="${x}" y="1305" font-size="13">${esc(date?new Date(date).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur'})+' MYT':'')}</text></g>`;
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${template.width} ${template.height}" style="display:block;width:100%;height:auto">${svg}</svg>`;
}
function signatureSvg(signature:Quotation['preparedSignature']){
 return signature?`<svg viewBox="0 0 600 180" style="width:165px;height:50px">${signature.strokes.map(stroke=>`<polyline points="${stroke.map(([x,y])=>`${x*600},${y*180}`).join(' ')}" fill="none" stroke="black" stroke-width="2.4"/>`).join('')}</svg>`:'';
}
export function quotationPrintHtml(q:Quotation){
 if(q.items.length===1)return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Quotation ${esc(q.number)}</title><style>@page{size:A4;margin:10.16mm}body{margin:0;background:#eee}.sheet{width:189.68mm;margin:15px auto;background:white}.toolbar{text-align:center;padding:15px;font:13px Arial}.toolbar button{padding:10px 20px;border:0;border-radius:7px;background:#183e66;color:white;cursor:pointer}@media print{body{background:white}.sheet{margin:0}.toolbar{display:none}}</style></head><body><div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button><p>Letterhead paper · A4 · Scale 100% · Browser headers and footers off</p></div><div class="sheet">${originalSheet(q)}</div></body></html>`;
 const total=totalAmount(q),pages=[];
 // Modest page capacity keeps the original closing and signature spaces intact.
 // Long descriptions get their own page rather than being clipped.
 const chunks:Quotation['items'][]=[];let chunk:Quotation['items']=[],weight=0;
 for(const item of q.items){const w=Math.max(1,Math.ceil(item.description.length/32),item.description.split('\n').length);if(chunk.length&&weight+w>4){chunks.push(chunk);chunk=[];weight=0}chunk.push(item);weight+=w}if(chunk.length)chunks.push(chunk);
 let offset=0;
 for(let page=0;page<chunks.length;page++){
 const items=chunks[page],last=page===chunks.length-1;
 pages.push(`<section><div class="letterhead-space"></div><h1>QUOTATION</h1><div class="details"><div><b>${esc(q.customer)}</b><div class="lines">${esc(q.address)}</div></div><table class="meta"><tr><td>Quotation No</td><td>: QT ${esc(q.number)}</td></tr><tr><td>Date</td><td>: ${dateText(q.date)}</td></tr><tr><td>Page/s</td><td>: ${page+1} of ${chunks.length}</td></tr></table></div><table class="contact"><tr><td>Attention</td><td>: ${esc(q.attention)}</td></tr><tr><td>Mobile Number &amp; Fax Number</td><td>: ${esc(q.phone)}</td></tr><tr><td>E-mail</td><td>: ${esc(q.email)}</td></tr></table><p>${esc(q.salutation)}</p><p>Greetings from K Hotel Sdn Bhd.</p><p class="lines">${esc(q.introduction)}</p><table class="items"><colgroup><col style="width:6%"><col style="width:26%"><col style="width:24%"><col style="width:20%"><col style="width:24%"></colgroup><thead><tr><th>NO.</th><th>ITEM</th><th>${esc(q.quantityHeading)}</th><th>UNIT PRICE</th><th>TOTAL AMOUNT</th></tr></thead><tbody>${items.map((i,index)=>`<tr><td>${offset+index+1}.</td><td class="lines">${esc(i.description)}</td><td>${esc(i.quantity)} ${esc(i.unit)}</td><td>RM ${money(i.price)}</td><td>RM ${money(lineAmount(i))}</td></tr>`).join('')}</tbody></table>${last?`<p><b>${words(total)}</b>${q.items.length>1?`<span style="float:right">TOTAL: RM ${money(total)}</span>`:''}</p><p class="lines">${esc(q.note)}</p><table class="terms"><tr><td>Terms of Payment</td><td>: ${esc(q.paymentTerms)}</td></tr><tr><td>Payment Method</td><td>: ${esc(q.paymentMethod)}</td></tr></table><p class="lines">${esc(q.validity)}</p><p>We trust that the price quoted is acceptable and we look forward to your favourable reply.</p><p>Thank You</p><div class="signature"><div><b>Prepared By</b><div class="sign-space">${signatureSvg(q.preparedSignature)}</div><div class="signature-line"></div><b>${esc(q.createdBy)}</b><p>${esc(q.createdAt ? new Date(q.createdAt).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur'})+' MYT' : '')}</p></div><div><b>Approved By</b><div class="sign-space">${signatureSvg(q.approvedSignature)}</div><div class="signature-line"></div><b>${esc(q.approvedBy||'Pending approval')}</b><p>${esc(q.approvedAt ? new Date(q.approvedAt).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur'})+' MYT' : '')}</p></div></div>`:'<p style="text-align:right">Continued on next page</p>'}</section>`);offset+=items.length;
 }
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Quotation ${esc(q.number)}</title><style>@page{size:A4;margin:10.16mm}*{box-sizing:border-box}body{margin:0;color:#000;background:#eee;font:10px Arial,sans-serif}section{width:189.68mm;min-height:276.68mm;padding:0;background:#fff;margin:15px auto;break-after:page}.letterhead-space{height:33mm}h1{font-size:17px;text-align:center;margin:0 0 8mm}p{margin:4mm 0;line-height:1.45}.details{display:flex;justify-content:space-between;gap:6mm;line-height:1.9;margin-bottom:6mm}.details>div{flex:1;min-width:0}.lines{white-space:pre-wrap;overflow-wrap:anywhere}.meta{min-width:65mm}.meta td{padding:0 2mm;vertical-align:top}.contact{margin:0 0 5mm}.contact td{padding:2mm 0;vertical-align:top}.contact td:first-child{width:48mm}.items{border-collapse:collapse;width:100%;table-layout:fixed;margin-top:2mm}.items th,.items td{border:1px solid #111;padding:4mm 2mm;text-align:center;overflow-wrap:anywhere}.items th{background:#d9e1f2;font-weight:bold;height:10mm}.items td{height:13mm}.items td:nth-child(2){text-align:left}.terms{width:100%;margin:4mm 0}.terms td{vertical-align:top;padding:1mm 0;overflow-wrap:anywhere;white-space:pre-wrap}.terms td:first-child{width:43mm}.signature{margin-top:8mm;break-inside:avoid;display:flex;justify-content:space-between;gap:20mm}.signature>div{width:65mm}.signature-line{border-top:1px solid #111;margin-bottom:3mm}.sign-space{height:23mm}.toolbar{text-align:center;padding:15px;font:14px Arial}.toolbar button{padding:10px 20px;border:0;border-radius:7px;background:#183e66;color:white;cursor:pointer}.toolbar p{margin:8px} @media print{body{background:#fff}section{margin:0;min-height:0}section:last-child{break-after:auto}.toolbar{display:none}th{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button><p>Use your letterhead paper · A4 · Scale 100% · Turn off browser headers and footers</p></div>${pages.join('')}</body></html>`;
}
