export type MaterialLine={approved_qty:number|string|null;issued_qty:number|string|null;requested_qty:number|string;line_status?:string};
export function materialLineStatus(line:MaterialLine){
 if(line.line_status==='rejected')return 'Rejected';
 if(line.line_status==='cancelled')return 'Cancelled';
 return Number(line.issued_qty)>0&&Number(line.issued_qty)>=Number(line.approved_qty)?'Issued':Number(line.approved_qty)>0?'Approved':'Pending';
}
export function materialRequestLabel(status:string,items:MaterialLine[]){
 const active=items.filter(i=>!i.line_status||i.line_status==='active');
 if(items.length>0&&active.length===0)return items.every(i=>i.line_status==='rejected')?'Rejected':items.every(i=>i.line_status==='cancelled')?'Cancelled':'Closed';
 if(status==='rejected')return 'Rejected';
 const pending=active.some(i=>!Number(i.approved_qty));const issued=active.some(i=>Number(i.issued_qty)>0);
 if(issued&&pending)return 'Partially Issued · Items Pending';
 if(pending&&active.some(i=>Number(i.approved_qty)>0))return 'Partially Approved';
 if(issued&&active.some(i=>Number(i.approved_qty)>Number(i.issued_qty)))return 'Partially Issued';
 return status.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
}
