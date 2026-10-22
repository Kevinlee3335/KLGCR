import template,{type TemplateRow} from "./committee-report-template";
import { escapeHtml } from "./membership";
export type CommitteeEntry = {member_id:string;full_name:string;amount:number;payments:{id:string;kind:string;amount:number;approved_at:string;membership_month:string}[]};
export type CommitteeReport = {month:string;generated_at:string;template_version:number;entries:CommitteeEntry[];payment_count:number;member_count:number;total_amount:number;remuneration:number;calculation_rule:string};
export function committeeMonthLabel(month:string) {
 return new Date(month+"T00:00:00+08:00").toLocaleDateString("en-GB",{month:"long",year:"numeric",timeZone:"Asia/Kuala_Lumpur"}).toUpperCase();
}
export function committeePayable(total:number) { return total<1000 ? 500 : Math.min(Math.round(total*40)/100,3000); }
export function validCommitteeMonth(month:string) {return /^\d{4}-(0[1-9]|1[0-2])-01$/.test(month);}
const money=(n:number)=>Number(n).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});
/** The original workbook's cells, merges, widths, row heights, type and borders. */
export function renderCommitteeReport(report:CommitteeReport, printable=true) {
 const label=committeeMonthLabel(report.month);
 const scale=700/template.widths.reduce((a,b)=>a+b,0);
 function rows(data:TemplateRow[],overrides:Record<string,string>={}) {
  return data.map(row=>`<tr style="height:${row.height*4/3*scale}px">${row.cells.map(cell=>{
   const borders=Object.entries(cell.border).filter(([,v])=>v).map(([side])=>`border-${side}:1px solid #111`).join(';');
   const value=overrides[cell.ref]??String(cell.value);
   return `<td colspan="${cell.colspan}" rowspan="${cell.rowspan}" style="font-family:${cell.font || 'Tahoma'},Arial,sans-serif;font-size:${((cell.ref==="E10"||cell.ref==="E58")?10:(cell.size||12))*4/3*scale}px;font-weight:${cell.bold?700:400};text-decoration:${cell.underline?'underline':'none'};text-align:${cell.align==='center'?'center':cell.align==='right'?'right':'left'};vertical-align:${cell.vertical==='top'?'top':'middle'};padding-left:${(cell.indent||0)*10*scale}px;${borders}">${escapeHtml(value).replaceAll('\n','<br>')}</td>`;
  }).join('')}</tr>`).join('');
 }
 const chunks:CommitteeEntry[][]=[];
 // Original form uses 36 detail rows on page one and 24 on its final page.
 const remaining=report.entries.slice();
 while(remaining.length>36){chunks.push(remaining.splice(0,36));}
 if(remaining.length>24){chunks.push(remaining.splice(0,24));}
 chunks.push(remaining);
 let index=0;
 const pages=chunks.map((entries,page)=>{
  const first=page===0,last=page===chunks.length-1;
  const header=rows(first?template.first:template.continued,{'C1':`SPORTS CLUB COMMITTEE FEES - ${label}`,'C4':`AMOUNT PAYABLE TO SPORTS COMMITTEE : RM ${money(report.remuneration)}`,'C52':`AMOUNT PAYABLE TO SPORTS COMMITTEE : RM ${money(report.remuneration)}`,'L13':`${label}\n(MYR)`,'L61':`${label}\n(MYR)`});
  const count=last?Math.max(entries.length,first?0:24):36;
  const body=Array.from({length:count},(_,i)=>{
   const entry=entries[i];
   return rows(template.body,{'C15':entry?String(++index):'','F15':entry?entry.full_name:'','L15':entry?money(entry.amount):''});
  }).join('');
  const footer=last?rows(template.footer,{'L87':money(report.total_amount)}):'';
  return `<section class="sheet"><table><colgroup>${template.widths.map(w=>`<col style="width:${w/template.widths.reduce((a,b)=>a+b,0)*100}%">`).join('')}</colgroup><tbody>${header}${body}${footer}</tbody></table></section>`;
 }).join('');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sports Committee - ${label}</title><style>@page{size:A4 portrait;margin:8mm 6.35mm 12mm}*{box-sizing:border-box}body{margin:0;background:#eee;color:#111}.toolbar{padding:16px;display:flex;gap:12px;align-items:center;justify-content:center;font:14px Arial}.toolbar a,.toolbar button{padding:10px 18px;border:1px solid #c7a14b;border-radius:8px;background:#fff;color:#392d14;text-decoration:none;cursor:pointer}.sheet{width:197.3mm;min-height:270mm;padding:0;margin:16px auto;background:white;break-after:page}.sheet:last-child{break-after:auto}table{width:100%;border-collapse:collapse;table-layout:fixed}td{padding-top:0;padding-bottom:0;white-space:nowrap;overflow:visible;line-height:1.05}@media print{body{background:white}.toolbar{display:none}.sheet{margin:0;min-height:0;width:100%}}@media(max-width:780px){body{overflow-x:auto}.toolbar{justify-content:flex-start;min-width:740px}}</style></head><body>${printable?'<nav class="toolbar"><a href="/admin/members/committee-reports">← Saved reports</a><button onclick="window.print()">Print / Save PDF</button><span>Saved monthly report · A4 portrait</span></nav>':''}${pages}</body></html>`;
}
