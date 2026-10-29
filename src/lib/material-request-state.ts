export type MaterialLine={approved_qty:number|string|null;issued_qty:number|string|null;requested_qty:number|string};
export function materialLineStatus(line:MaterialLine){return Number(line.issued_qty)>0&&Number(line.issued_qty)>=Number(line.approved_qty)?'Issued':Number(line.approved_qty)>0?'Approved':'Pending';}
export function materialRequestLabel(status:string,items:MaterialLine[]){
 if(status==='rejected')return 'Rejected';
 const pending=items.some(i=>!Number(i.approved_qty));const issued=items.some(i=>Number(i.issued_qty)>0);
 if(issued&&pending)return 'Partially Issued · Items Pending';
 if(pending&&items.some(i=>Number(i.approved_qty)>0))return 'Partially Approved';
 if(issued&&items.some(i=>Number(i.approved_qty)>Number(i.issued_qty)))return 'Partially Issued';
 return status.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
}
