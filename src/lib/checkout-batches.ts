export type BatchRecord = {id:string;batch_no:string;name:string;state:'active'|'closing'|'closed';started_at:string;closed_at:string|null;closed_by_name?:string|null;closing_note?:string|null;summary_document_id:string;details_document_id:string};
export type SnapshotRow = {id:string|number;[key:string]:unknown};
export type BatchRoom = SnapshotRow & {id:string;room_no:string;block:string;reference_no:string;status:string;deleted_at:string|null;created_at:string;ready_at:string|null;maintenance_name:string|null;cleaner_name:string|null;inspection_checklist:Record<string,unknown>|null};
export type BatchSnapshot = {version:number;batch:BatchRecord;rooms:BatchRoom[];defects:SnapshotRow[];history:SnapshotRow[];photos:SnapshotRow[];painting:SnapshotRow[];requests:SnapshotRow[];request_items:SnapshotRow[];decisions:SnapshotRow[];issues:SnapshotRow[];stockouts:SnapshotRow[];returns:SnapshotRow[]};
export type MaterialMovement = {key:string;source:'issue'|'stockout';id:number;itemId:string;code:string;name:string;unit:string;team:'Maintenance'|'Cleaner'|'Office';quantity:number;returned:number;net:number;recipient:string;actor:string;date:string;roomId:string|null;requestId:string|null;note:string};
export const batchDate=(value:unknown)=>value?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'short'}).format(new Date(String(value))):'Not recorded';
export const batchQuantity=(value:number)=>value.toLocaleString('en-MY',{maximumFractionDigits:2});
export function batchRoomLabel(room:BatchRoom){const n=room.room_no.toUpperCase().replace(/[^A-Z0-9]/g,'');return /^[A-D]/.test(n)?n:room.block+n;}
const text=(value:unknown,fallback='Not recorded')=>value==null||value===''?fallback:String(value);
export function batchMovements(snapshot:BatchSnapshot):MaterialMovement[]{
 const returns=new Map<string,number>();
 for(const r of snapshot.returns){const key=r.issue_id!=null?'issue:'+r.issue_id:'stockout:'+r.adjustment_id;returns.set(key,(returns.get(key)||0)+Math.round(Number(r.qty)*100));}
 return [...snapshot.issues.map(row=>({row,source:'issue' as const})),...snapshot.stockouts.map(row=>({row,source:'stockout' as const}))].map(({row,source})=>{
  const key=source+':'+row.id;const qty=Math.round(Number(row.qty)*100),back=returns.get(key)||0;
  return {key,source,id:Number(row.id),itemId:text(row.inventory_item_id,''),code:text(row.item_code,''),name:text(row.description),unit:text(row.unit,'unit not recorded'),team:row.inventory_group==='cleaner'?'Cleaner':row.inventory_group==='office'?'Office':'Maintenance',quantity:qty/100,returned:back/100,net:(qty-back)/100,
   recipient:source==='issue'?text(row.staff_name):text(String(row.note||'').match(/Taken by:\s*(.*?)\s*\|\s*Purpose:/i)?.[1]),actor:text(row.issued_by_name),date:text(source==='issue'?row.issued_at:row.adjusted_at,''),roomId:source==='issue'?text(row.checkout_room_id,''):null,requestId:source==='issue'?text(row.request_id,''):null,note:text(row.note,'')};
 });
}
export function batchMaterialTotals(snapshot:BatchSnapshot){
 const map=new Map<string,{key:string;code:string;name:string;unit:string;team:MaterialMovement['team'];quantity:number;returned:number;net:number}>();
 for(const m of batchMovements(snapshot)){
  const key=m.team+'|'+m.itemId+'|'+m.unit;
  const row=map.get(key)||{key,code:m.code,name:m.name,unit:m.unit,team:m.team,quantity:0,returned:0,net:0};
  row.quantity+=Math.round(m.quantity*100);row.returned+=Math.round(m.returned*100);row.net+=Math.round(m.net*100);map.set(key,row);
 }
 return [...map.values()].map(r=>({...r,quantity:r.quantity/100,returned:r.returned/100,net:r.net/100})).sort((a,b)=>a.team.localeCompare(b.team)||a.name.localeCompare(b.name));
}
export function batchSummary(snapshot:BatchSnapshot){const rooms=snapshot.rooms.filter(r=>!r.deleted_at);const ids=new Set(rooms.map(r=>r.id));const defects=snapshot.defects.filter(d=>ids.has(String(d.checkout_room_id))&&!/^no defects?[.!]?$/i.test(String(d.description).trim()));return {total:rooms.length,ready:rooms.filter(r=>r.status==='ready_for_occupancy').length,repairRooms:new Set(defects.map(d=>d.checkout_room_id)).size,defects:defects.length,cleaned:rooms.filter(r=>r.status==='ready_for_occupancy').length,removed:snapshot.rooms.length-rooms.length};}
