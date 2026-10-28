export type PriceLine = { description:string; quantity:number; unit:string; unitPrice:number; lineTotal:number; page:number };
export type PriceDocument = {id:string; company:string; folder:string; file_name:string; content_text:string; receivedAt:string};
export type PriceRecord = PriceDocument & { date:string; dateSource:'document'|'email'; reference:string; lines:PriceLine[]; taxBasis:string };
const amount='([0-9][0-9,]*\\.\\d{2})';
// Require an item number, quantity, unit, unit price AND line total. Never use the invoice grand total.
const item=new RegExp('^\\s*\\d{1,3}[.)]?\\s+(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s+(NOS?|PCS?|PIECES?|SETS?|LOTS?|UNITS?|MTRS?|METERS?|METRES?|M|KG|LITRES?)\\s+(?:RM\\s*)?'+amount+'\\s+(?:RM\\s*)?'+amount+'(?:\\s|$)','i');
const number=(s:string)=>Number(s.replace(/,/g,''));
export function priceSearchTerms(query:string) {
 return (query.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).map(t=>/^(norzel|nozel|nozzel|norzzle)$/.test(t)?'nozzle':t);
}
export function parsePriceLines(text:string):PriceLine[] {
 const found:PriceLine[]=[];
 for(const [page,body] of text.split('\f').entries()) {
  let previous:PriceLine|undefined;
  for(const line of body.split(/\r?\n/)) {
  const m=line.match(item);if(!m) {
    if(previous && /^\s*(?:CAPACITY\s*:|WARRANTY\s*:|MODEL\s*:|SIZE\s*:|BRAND\s*:|CO2\s+PANEL|CARD\s+FOR|\(for\s+No)/i.test(line)) previous.description+=' '+line.trim();
    else if(line.trim()) previous=undefined;
    continue;
  }
  const quantity=number(m[2]),unitPrice=number(m[4]),lineTotal=number(m[5]);
  if(quantity<=0||unitPrice<0||!Number.isFinite(lineTotal)||Math.abs(quantity*unitPrice-lineTotal)>0.021)continue;
  previous={description:m[1].replace(/\s+/g,' ').trim(),quantity,unit:m[3].toUpperCase(),unitPrice,lineTotal,page:page+1};found.push(previous);
 }
 }
 return found;
}
function documentDate(text:string):string|null {
 const match=text.match(/\bDate\s*[:.]?\s*(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})/i);
 if(!match)return null;
 const [,day,month,year]=match,date=new Date(Date.UTC(+year,+month-1,+day));
 if(date.getUTCFullYear()!==+year||date.getUTCMonth()!==+month-1||date.getUTCDate()!==+day)return null;
 return date.toISOString().slice(0,10);
}
export function recentPriceRecords(documents:PriceDocument[],query:string,limit=3):PriceRecord[] {
 const terms=priceSearchTerms(query);if(!terms.length)return [];
 const records:PriceRecord[]=[];
 for(const doc of documents) {
  if(!['Quotation','Invoice'].includes(doc.folder)||/credit\s*note/i.test(doc.content_text.slice(0,1200)))continue;
  if(!/\b(?:RM|MYR)\b/i.test(doc.content_text)||/\b(?:USD|SGD|EUR|GBP|CNY)\b|US\$/i.test(doc.content_text))continue;
  const lines=parsePriceLines(doc.content_text).filter(line=>terms.every(term=>line.description.toLowerCase().includes(term)));
  if(!lines.length)continue;
  const date=documentDate(doc.content_text);
  const reference=doc.content_text.match(/Our\s+Ref\.?\s*:\s*([A-Z0-9][A-Z0-9/()_-]+)/i)?.[1] ||
    doc.file_name.match(/\b(?:MS|SQ|PI|INV)[A-Z]*\d[\w/-]*/i)?.[0] || doc.id;
  records.push({...doc,date:date||doc.receivedAt.slice(0,10),dateSource:date?'document':'email',reference,lines,
    taxBasis:/Total\s+Excl\.?\s*SST/i.test(doc.content_text)?'Line totals exclude SST; labour is listed separately.':'Tax and labour inclusion: refer to the original PDF.'});
 }
 // A quote number can be reused in a later year; keep those separate. Merge revisions/resends within the same year.
 records.sort((a,b)=>b.date.localeCompare(a.date)||revision(b.reference)-revision(a.reference)||a.id.localeCompare(b.id));
 const seen=new Set<string>();
 return records.filter(r=>{
  const base=r.reference.replace(/\(R\d*\)|[_-]?REVISED/gi,'');
  const key=[r.company,r.folder,base.toLowerCase(),r.date.slice(0,4)].join(':');
  if(seen.has(key))return false;seen.add(key);return true;
 }).slice(0,limit);
}
function revision(reference:string){return Number(reference.match(/\(R(\d*)\)/i)?.[1]||0);}
