import type { SupabaseClient } from '@supabase/supabase-js';
export type OccupancyRow = {id:string;room_no:string;ready_at:string|null;occupancy_pax:number|null;block:{code:string}|null};
export function malaysiaDate(now=new Date()) {return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function reportDate(value:string) {if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const d=new Date(`${value}T00:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?value:null;}
export function reportBounds(date:string){if(!reportDate(date))throw new Error('Invalid report date');const start=new Date(`${date}T00:00:00+08:00`);return {start:start.toISOString(),end:new Date(start.getTime()+86400000).toISOString()};}
export function displayReportDate(date:string){return date.split('-').reverse().join('/');}
export function occupancyRoom(row:OccupancyRow){const room=row.room_no.toUpperCase().replace(/[^A-Z0-9]/g,'');return /^[A-D]/.test(room)?room:`${row.block?.code||''}${room}`;}
function occupancyBounds(date?: string, endDate?: string) {
 if ((endDate && !date) || (date && endDate && date > endDate)) throw new Error('Invalid report date range');
 return date ? {start: reportBounds(date).start, end: reportBounds(endDate || date).end} : null;
}

function readyRoomsQuery(
 db: SupabaseClient,
 columns: string,
 bounds: ReturnType<typeof occupancyBounds>,
 options?: {count: 'exact'; head: true},
) {
 const query = db.from('checkout_rooms').select(columns, options).is('deleted_at', null).eq('status', 'ready_for_occupancy');
 return bounds ? query.gte('ready_at', bounds.start).lt('ready_at', bounds.end) : query;
}

export async function countOccupancyRooms(db: SupabaseClient, date?: string, endDate?: string) {
 const {count, error} = await readyRoomsQuery(db, 'id', occupancyBounds(date, endDate), {count: 'exact', head: true});
 if (error || count === null) throw new Error('Unable to load occupancy report. Please try again.');
 return count;
}

export async function loadOccupancyReport(db: SupabaseClient, date?: string, endDate?: string) {
 const bounds = occupancyBounds(date, endDate);
 const rows: OccupancyRow[] = [];
 for (let offset = 0; ; offset += 1000) {
  const {data, error} = await readyRoomsQuery(db, 'id,room_no,ready_at,occupancy_pax,block:blocks!block_id(code)', bounds)
   .order('id').range(offset, offset + 999);
  if (error) throw new Error('Unable to load occupancy report. Please try again.');
  rows.push(...data as unknown as OccupancyRow[]);
  if (data.length < 1000) break;
 }
 return rows.sort((a, b) => occupancyRoom(a).localeCompare(occupancyRoom(b), undefined, {numeric: true}));
}
