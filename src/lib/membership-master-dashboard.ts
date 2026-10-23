import type {MasterResult} from './membership-master';
export type MasterRecord={id:number;name:string;originalName:string;serial:string;reference:string;status:string;fees:Record<string,number>};
export type MasterDashboard={months:string[];records:MasterRecord[]};
export function membershipDashboard(result:MasterResult):MasterDashboard{
 const sheet=result.layout.sheets[0];
 const months=sheet.cols.slice(5).map((_,i)=>new Date(Date.UTC(2024,7+i,1)).toISOString().slice(0,7));
 const records=sheet.rows.slice(4,result.totalRow-1).flatMap((row,i)=>{
  const originalName=String(row.cells[3]?.v||'').trim();if(!originalName)return [];
  const fees:Record<string,number>={};months.forEach((month,j)=>{const v=row.cells[j+5]?.v;if(typeof v==='number'&&Number.isFinite(v)&&v>0)fees[month]=v;});
  return [{id:i+5,name:originalName.split('(')[0].trim()||originalName,originalName,serial:String(row.cells[1]?.v||''),reference:String(row.cells[4]?.v||''),status:String(row.cells[2]?.v||'UNSPECIFIED').toUpperCase(),fees}];
 });
 return {months,records};
}
export function monthSummary(records:MasterRecord[],month:string){return {total:records.reduce((n,r)=>n+(r.fees[month]||0),0),paid:records.filter(r=>(r.fees[month]||0)>0).length};}
export function filterMasterRecords(records:MasterRecord[],month:string,query:string,payment:string,status:string){
 const q=query.trim().toLocaleLowerCase();return records.filter(r=>(!q||[r.originalName,r.reference,r.serial].some(s=>s.toLocaleLowerCase().includes(q)))&&(status==='all'||r.status===status)&&(payment==='all'||(payment==='paid'?(r.fees[month]||0)>0:!r.fees[month])));
}
export function monthLabel(month:string,short=false){return new Date(month+'-01T00:00:00Z').toLocaleDateString('en-GB',{month:short?'short':'long',year:'numeric',timeZone:'UTC'});}
