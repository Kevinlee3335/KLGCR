import {CFB} from 'xlsx';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {escapeHtml} from './membership';
export type MasterCell={v:string|number;s:number};
export type MasterSheet={name:string;rows:{height:number;hidden?:boolean;cells:MasterCell[]}[];cols:{width:number;hidden:boolean}[];merges:number[][]};
export type MasterLayout={sheets:MasterSheet[];styles:Record<string,string>;formats?:Record<string,string>;sha256:string};
export type MasterMember={id:string;full_name:string;room_no:string;member_number:string|null;member_type:string;status:string;starts_on:string|null;expires_on:string|null;created_at:string};
export type MasterPayment={id:string;member_id:string;period_start:string;amount:number;kind:string};
export type MasterResult={layout:MasterLayout;changes:Map<string,string|number>;inserted:number;totalRow:number;warnings:string[]};
export const masterKey=(col:number,row:number)=>`${columnName(col)}${row}`;
export function columnName(n:number){let s='';while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
const nameKey=(s:string)=>s.split('(')[0].normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
const monthValue=(s:string)=>{const d=new Date(s+'-01T00:00:00Z');return Math.round((d.getTime()-Date.UTC(1899,11,30))/86400000);};
export function buildMembershipMaster(source:MasterLayout,members:MasterMember[],payments:MasterPayment[],today:string):MasterResult{
 const layout=structuredClone(source),sheet=layout.sheets[0],changes=new Map<string,string|number>(),warnings:string[]=[];
 const originalTotal=sheet.rows.findIndex(r=>r.cells[1]?.v==='TOTAL')+1;
 if(originalTotal<5)throw new Error('Master template total row missing.');
 const originalCols=sheet.cols.length,monthColumns=new Map<string,number>();
 // Template header dates are display labels; the source's columns F:AF run Aug 2024–Oct 2026.
 for(let c=6;c<=originalCols;c++){const d=new Date(Date.UTC(2024,7+c-6,1));monthColumns.set(d.toISOString().slice(0,7),c);}
 const paid=payments.filter(p=>p.kind==='registration'||p.kind==='renewal');
 const latest=[today.slice(0,7),...paid.map(p=>p.period_start.slice(0,7))].sort().at(-1)!;
 let last=[...monthColumns.keys()].at(-1)!;
 while(last<latest){const d=new Date(last+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);last=d.toISOString().slice(0,7);const col=sheet.cols.length+1;monthColumns.set(last,col);sheet.cols.push({...sheet.cols.at(-1)!,hidden:false});for(const r of sheet.rows)r.cells.push({v:'',s:r.cells[originalCols-1]?.s||0});sheet.rows[3].cells[col-1].v=d.toLocaleDateString('en-GB',{month:'short',year:'2-digit',timeZone:'UTC'}).replace(' ','-');changes.set(masterKey(col,4),monthValue(last));}
 const baseNameRows=new Map<string,number[]>(),serials=new Map<string,number>();let maxNo=0;
 for(let row=5;row<originalTotal;row++){const r=sheet.rows[row-1].cells;if(r[3]?.v){const key=nameKey(String(r[3].v));baseNameRows.set(key,[...(baseNameRows.get(key)||[]),row]);}maxNo=Math.max(maxNo,Number(r[0]?.v)||0);const serial=String(r[1]?.v||'').match(/^(\d{4})\s*-\s*(\d+)$/);if(serial)serials.set(serial[1],Math.max(serials.get(serial[1])||0,Number(serial[2])));}
 const rowForMember=new Map<string,number>();let inserted=0;
 const memberIds=new Set(paid.map(p=>p.member_id));
 for(const m of members.filter(m=>memberIds.has(m.id)).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))){
  const candidates=baseNameRows.get(nameKey(m.full_name))||[],reference=m.member_type==='outsider'?m.member_number||'':m.room_no;
  const exact=candidates.filter(row=>String(sheet.rows[row-1].cells[4].v).trim().toUpperCase()===reference.trim().toUpperCase());
  let row=exact.length===1?exact[0]:candidates.length===1?candidates[0]:0;
  if(!row){if(candidates.length>1)warnings.push(`Multiple historical matches for ${m.full_name}; kept as a separate system member.`);row=originalTotal+inserted;const model=sheet.rows[originalTotal-2];sheet.rows.splice(row-1,0,{height:model.height,cells:model.cells.map(c=>({v:'',s:c.s}))});inserted++;const year=new Date(m.created_at).toLocaleDateString('en-CA',{year:'numeric',timeZone:'Asia/Kuala_Lumpur'});const next=(serials.get(year)||0)+1;serials.set(year,next);const vals=[++maxNo,`${year} - ${String(next).padStart(4,'0')}`,'',m.full_name,reference];for(let c=1;c<=5;c++){sheet.rows[row-1].cells[c-1].v=vals[c-1];changes.set(masterKey(c,row),vals[c-1]);}}
  rowForMember.set(m.id,row);
  const cell=sheet.rows[row-1].cells[2],old=String(cell.v);
  // Refund/forfeit are manual deposit decisions, not inferred from payment approval.
  if(!['REFUNDED','FORFEITED'].includes(old)){const status=m.status==='active'&&!!m.expires_on&&m.expires_on>=today&&(!m.starts_on||m.starts_on<=today)?'ACTIVE':'DEACTIVATE';if(status!==old){cell.v=status;changes.set(masterKey(3,row),status);}}
 }
 const totalRow=originalTotal+inserted;
 for(const merge of sheet.merges){if(merge[0]>=originalTotal)merge[0]+=inserted;if(merge[2]>=originalTotal)merge[2]+=inserted;if(merge[2]<=3&&merge[3]===originalCols)merge[3]=sheet.cols.length;}
 const amounts=new Map<string,number>();
 for(const p of paid){const row=rowForMember.get(p.member_id),col=monthColumns.get(p.period_start.slice(0,7));if(!row||!col)continue;const key=masterKey(col,row);amounts.set(key,(amounts.get(key)||0)+Number(p.amount));}
 const deltas=new Map<number,number>();
 for(const [key,amount] of amounts){const match=key.match(/^([A-Z]+)(\d+)$/)!;const row=Number(match[2]);const col=[...monthColumns.values()].find(c=>columnName(c)===match[1])!;const cell=sheet.rows[row-1].cells[col-1],base=typeof cell.v==='number'?cell.v:0;
  // A historical payment already recorded for the same member/month is not charged twice.
  const next=Math.max(base,amount);if(next!==base){cell.v=next;changes.set(key,next);deltas.set(col,(deltas.get(col)||0)+next-base);}
 }
 for(const [month,col] of monthColumns){const cell=sheet.rows[totalRow-1].cells[col-1];if(col>originalCols){const sum=sheet.rows.slice(4,totalRow-1).reduce((n,r)=>n+(typeof r.cells[col-1].v==='number'?Number(r.cells[col-1].v):0),0);cell.v=sum;changes.set(masterKey(col,totalRow),sum);}else if(deltas.has(col)&&typeof cell.v==='number'){cell.v+=deltas.get(col)!;changes.set(masterKey(col,totalRow),cell.v);}if(String(cell.v).startsWith('#'))warnings.push(`${month}: source total contains ${cell.v}; original formula retained.`);}
 return {layout,changes,inserted,totalRow,warnings};
}
export function renderMembershipMaster(result:MasterResult,index=0,showHidden=false){
 const sheet=result.layout.sheets[index]||result.layout.sheets[0],visible=sheet.cols.map((c,i)=>showHidden||!c.hidden?i+1:0).filter(Boolean),skip=new Set<string>(),merged=new Map<string,{rows:number;cols:number;sourceCol:number}>();
 for(const [r1,c1,r2,c2] of sheet.merges){const cols=visible.filter(c=>c>=c1&&c<=c2);if(!cols.length)continue;const anchor=masterKey(cols[0],r1);merged.set(anchor,{rows:r2-r1+1,cols:cols.length,sourceCol:c1});for(let r=r1;r<=r2;r++)for(const c of cols)if(masterKey(c,r)!==anchor)skip.add(masterKey(c,r));}
 return `<table class="master-excel"><colgroup>${visible.map(c=>`<col style="width:${sheet.cols[c-1].width}px">`).join('')}</colgroup><tbody>${sheet.rows.map((row,i)=>row.hidden&&!showHidden?'':`<tr style="height:${row.height*4/3}px">${visible.map(c=>{const key=masterKey(c,i+1);if(skip.has(key))return '';const m=merged.get(key),cell=row.cells[(m?.sourceCol||c)-1]||{v:'',s:0};return `<td ${m?`colspan="${m.cols}" rowspan="${m.rows}"`:''} style="${escapeHtml(result.layout.styles[cell.s]||'')}">${escapeHtml(typeof cell.v==='number'&&result.layout.formats?.[cell.s]?.includes('.00')?cell.v.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}):String(cell.v))}</td>`;}).join('')}</tr>`).join('')}</tbody></table>`;
}
/** Patch only the live worksheet XML. The source styles, drawings and other five sheets stay byte-identical. */
export function exportMembershipMaster(bytes:Buffer,result:MasterResult){
 if(createHash('sha256').update(bytes).digest('hex')!==result.layout.sha256)throw new Error('Source template checksum mismatch.');
 if(!result.changes.size&&!result.inserted)return bytes;
 const archive=CFB.read(bytes,{type:'buffer'}),path='Root Entry/xl/worksheets/sheet1.xml',idx=archive.FullPaths.indexOf(path);if(idx<0)throw new Error('Source worksheet missing.');
 let xml=Buffer.from(archive.FileIndex[idx].content).toString('utf8');const originalTotal=result.totalRow-result.inserted,sourceCols=result.layout.sheets[0].cols.length;
 const rowModel=xml.match(new RegExp(`<row\\b[^>]*\\br="${originalTotal-1}"[^>]*>[\\s\\S]*?<\\/row>`))?.[0];if(!rowModel)throw new Error('Template row missing.');
 const styleFor=(col:number,row:number)=>result.layout.sheets[0].rows[row-1]?.cells[col-1]?.s||0;
 if(result.inserted){xml=xml.replace(/\br="([A-Z]*)(\d+)"/g,(all,col,n)=>Number(n)>=originalTotal?`r="${col}${Number(n)+result.inserted}"`:all);const added=Array.from({length:result.inserted},(_,i)=>rowModel.replace(/\br="([A-Z]*)(\d+)"/g,(_a,col)=>`r="${col}${originalTotal+i}"`).replace(/<(v|f|is)\b[^>]*>[\s\S]*?<\/\1>/g,'').replace(/ t="[^"]*"/g,'')).join('');xml=xml.replace(new RegExp(`(<row\\b[^>]*\\br="${result.totalRow}"[^>]*>)`),added+'$1');xml=xml.replace(/(<mergeCell\b[^>]*ref=")([^\"]+)(")/g,(_all,a,ref,z)=>a+ref.replace(/([A-Z]+)(\d+)/g,(_m:string,c:string,n:string)=>c+(Number(n)>=originalTotal?Number(n)+result.inserted:n))+z);}
 function setCell(ref:string,value:string|number,formula?:string){const col=ref.match(/^[A-Z]+/)![0],row=Number(ref.match(/\d+$/)![0]);let n=0;for(const c of col)n=n*26+c.charCodeAt(0)-64;const style=styleFor(n,row);const cell=typeof value==='number'?`<c r="${ref}" s="${style}">${formula?`<f>${escapeHtml(formula)}</f>`:''}<v>${value}</v></c>`:`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeHtml(value)}</t></is></c>`;
 const re=new RegExp(`<c\\b(?=[^>]*\\br="${ref}")(?:[^>]*\\/>|[^>]*>[\\s\\S]*?<\\/c>)`);if(re.test(xml))xml=xml.replace(re,cell);else{const rr=new RegExp(`(<row\\b[^>]*\\br="${row}"[^>]*>)([\\s\\S]*?)(<\\/row>)`);xml=xml.replace(rr,(_a,a,body,z)=>{const cells=body.match(/<c\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/c>)/g)||[];cells.push(cell);cells.sort((a:string,b:string)=>{const num=(s:string)=>{let x=0;for(const c of s.match(/\br="([A-Z]+)/)![1])x=x*26+c.charCodeAt(0)-64;return x;};return num(a)-num(b);});return a+cells.join('')+z;});}}
 const originalMax=32;
 for(let col=33;col<=sourceCols;col++)for(let row=5;row<result.totalRow;row++)setCell(masterKey(col,row),result.layout.sheets[0].rows[row-1].cells[col-1].v);
 for(const [ref,value] of result.changes){let formula:string|undefined;if(ref.endsWith(String(result.totalRow))&&/^([A-Z]+)\d+$/.test(ref)){const col=ref.match(/^[A-Z]+/)![0];const orig=xml.match(new RegExp(`<c\\b[^>]*r="${ref}"[^>]*>([\\s\\S]*?)<\\/c>`))?.[1];const oldFormula=orig?.match(/<f[^>]*>([\s\S]*?)<\/f>/)?.[1];formula=oldFormula?oldFormula.replace(/&amp;/g,'&')+(result.inserted?`+SUM(${col}${originalTotal}:${col}${result.totalRow-1})`:''):`SUM(${col}5:${col}${result.totalRow-1})`;}
 setCell(ref,value,formula);}
 if(sourceCols>originalMax){xml=xml.replace(/(<mergeCell\b[^>]*ref=")(A1|F3):AF([23])(")/g,(_a,p,start,row,z)=>`${p}${start}:${columnName(sourceCols)}${row}${z}`);const cols=Array.from({length:sourceCols-originalMax},(_,i)=>`<col min="${originalMax+i+1}" max="${originalMax+i+1}" width="${(result.layout.sheets[0].cols[originalMax+i].width-5)/7}" customWidth="1"/>`).join('');xml=xml.replace('</cols>',cols+'</cols>');}
 xml=xml.replace(/(<dimension\b[^>]*ref=")([^"]+)("\/?>)/,(_all,a,ref,z)=>{const end=ref.split(':').at(-1)!.match(/([A-Z]+)(\d+)/)!;let c=0;for(const ch of end[1])c=c*26+ch.charCodeAt(0)-64;return a+`A1:${columnName(Math.max(c,sourceCols))}${Number(end[2])+result.inserted}`+z;});
 archive.FileIndex[idx].content=Buffer.from(xml);archive.FileIndex[idx].size=Buffer.byteLength(xml);
 const output=CFB.write(archive,{type:'buffer',fileType:'zip',compression:true});return Buffer.from(output);
}
export function decodeMasterLayout(value:{gzip_base64:string}){return JSON.parse(gunzipSync(Buffer.from(value.gzip_base64,'base64')).toString('utf8')) as MasterLayout;}
