import Link from 'next/link';
import { ClipboardList, Sparkles } from 'lucide-react';
import followUp from './monitoring-follow-up.module.css';
import statusTable from './checkout-status-table.module.css';
import {checkoutProgress} from '@/lib/checkouts';

export type CheckoutReportRoom = {id:string;reference_no:string;room_no:string;block:string;status:string;maintenance:string;assigned_to?:string|null;cleaner:string;maintenance_status:string;cleaner_status:string;cleaner_id?:string|null;repair_percent:number;maintenance_today:boolean;cleaner_today:boolean};
export type CheckoutStatusReport = {date:string;total:number;ready:number;ready_today:number;maintenance_completed:number;maintenance_today:number;pending_material:number;cleaner_completed:number;cleaner_today:number;cleaner_in_progress:number;rooms:CheckoutReportRoom[]};
export type CheckoutDashboardSource = {id:string;status:string;cleaner_id:string|null;utmspace_defects:string;defects:{description:string;status:string}[]};

type StaffCounts = {name:string;total:number;completed:number;today:number;active:number;pending:number};
export function getCheckoutDashboardCounts(report:CheckoutStatusReport, sources:CheckoutDashboardSource[]) {
 const sourceById=new Map(sources.map(room=>[room.id,room]));
 const awaitingCleaning=report.rooms.filter(room=>{
  const source=sourceById.get(room.id);
  if(!source || source.cleaner_id) return false;
  const progress=checkoutProgress(source.defects || []);
  return (source.status==='verification' && progress.remaining===0) || (source.status==='second_inspection' && progress.total===0 && /^no defects?[.!]?$/i.test((source.utmspace_defects || '').trim()));
 });
 const cleaningRooms=report.rooms.filter(room=>room.status==='cleaning'||room.status==='ready_for_occupancy'||(room.status==='verification'&&!!room.cleaner_id));
 const cleaningCompleted=cleaningRooms.filter(room=>room.cleaner_status==='Completed').length;
 const cleaningActive=cleaningRooms.filter(room=>room.cleaner_status!=='Completed').length;
 const cleaners=new Map<string,StaffCounts>();
 for(const room of cleaningRooms) {
  const key=room.cleaner_id || `name:${room.cleaner}`;
  const row=cleaners.get(key)||{name:room.cleaner,total:0,completed:0,today:0,active:0,pending:0};
  row.total++; row.completed+=Number(room.cleaner_status==='Completed'); row.today+=Number(room.cleaner_today===true); row.active+=Number(room.cleaner_status!=='Completed'); cleaners.set(key,row);
 }
 const maintenance=new Map<string,StaffCounts>();
 const maintenanceRooms=report.rooms.filter(room=>checkoutProgress(sourceById.get(room.id)?.defects || []).total>0);
 for(const room of maintenanceRooms) {
  const key=room.assigned_to || `name:${room.maintenance}`;
  const row=maintenance.get(key)||{name:room.maintenance,total:0,completed:0,today:0,active:0,pending:0};
  row.total++; row.completed+=Number(room.repair_percent===100); row.today+=Number(room.maintenance_today===true); row.active+=Number(room.repair_percent<100 && !!room.assigned_to); row.pending+=Number(room.maintenance_status==='Pending Material'); maintenance.set(key,row);
 }
 const awaitingMaintenance=maintenanceRooms.filter(room=>room.repair_percent<100 && !room.assigned_to).length;
 return {awaitingCleaningIds:new Set(awaitingCleaning.map(room=>room.id)),awaitingCleaning:awaitingCleaning.length,cleaningCompleted,cleaningActive,cleaningToday:cleaningRooms.filter(room=>room.cleaner_today===true).length,cleaningTotal:cleaningRooms.length,cleaners,maintenance,awaitingMaintenance};
}
export function CheckoutStatusDashboard({report,details=false,defectRoomCount,sources}:{report:CheckoutStatusReport;details?:boolean;defectRoomCount?:number;sources:CheckoutDashboardSource[]}) {
 const counts=getCheckoutDashboardCounts(report,sources);
 return <section className="checkout-status-dashboard">
  <div className="section-head"><div><p className="eyebrow">Room operations · {report.date}</p><h2>Check-out Dashboard</h2></div>{!details&&<Link className="button secondary" href="/admin/checkouts/status-report">Status Table &amp; Report</Link>}</div>
  <div className="checkout-kpi-grid">
   <article className="panel checkout-kpi-card"><span>Check-out Rooms</span><strong>{report.total}<small> total rooms</small></strong><dl><div><dt>Ready for occupancy</dt><dd>{report.ready}</dd></div><div><dt>Not ready yet</dt><dd>{Math.max(0,report.total-report.ready)}</dd></div><div><dt>Ready today</dt><dd>{report.ready_today}</dd></div></dl></article>
   <article className="panel checkout-kpi-card"><span>Maintenance</span><strong>{defectRoomCount??report.total}<small> rooms with defects</small></strong><dl><div><dt>Repairs unfinished</dt><dd>{report.rooms.filter(r=>r.repair_percent<100).length}</dd></div><div><dt>Awaiting assign</dt><dd>{counts.awaitingMaintenance}</dd></div><div><dt>Defect rooms repaired</dt><dd>{Math.max(0,(defectRoomCount??report.total)-report.rooms.filter(r=>r.repair_percent<100).length)}</dd></div><div><dt>Completed today</dt><dd>{report.maintenance_today}</dd></div><div><dt>Pending material</dt><dd>{report.pending_material}</dd></div></dl></article>
   <article className="panel checkout-kpi-card"><span>Cleaning</span><strong>{counts.awaitingCleaning+counts.cleaningActive}<small> rooms not cleaned yet</small></strong><dl><div><dt>Handed to cleaning</dt><dd>{counts.cleaningTotal}</dd></div><div><dt>Awaiting assign</dt><dd>{counts.awaitingCleaning}</dd></div><div><dt>Cleaning in progress</dt><dd>{counts.cleaningActive}</dd></div><div><dt>Cleaning completed</dt><dd>{counts.cleaningCompleted}</dd></div><div><dt>Completed today</dt><dd>{counts.cleaningToday}</dd></div></dl></article>
  </div>
  <section className={`${followUp.panel} ${statusTable.panel}`} aria-labelledby="maintenance-status-title">
   <header className={followUp.header}><div className={followUp.heading}><span className={followUp.icon}><ClipboardList size={20}/></span><div><span className={followUp.eyebrow}>CHECK-OUT ROOMS</span><h2 id="maintenance-status-title">Maintenance Status Table</h2><p>Room repair progress by maintenance staff.</p></div></div></header>
   <div className={`${followUp.scroll} ${statusTable.scroll}`} role="region" aria-labelledby="maintenance-status-title" tabIndex={0}><table className={`${followUp.table} ${statusTable.table}`} aria-labelledby="maintenance-status-title"><thead><tr><th scope="col">Maintenance</th><th scope="col">Total rooms</th><th scope="col">Completed</th><th scope="col">Completed today</th><th scope="col">In progress</th><th scope="col">Pending material</th></tr></thead><tbody>{[...counts.maintenance].map(([id,r])=><tr key={id}><th scope="row">{r.name}</th><td>{r.total}</td><td>{r.completed}</td><td>{r.today}</td><td>{r.active}</td><td>{r.pending}</td></tr>)}</tbody></table></div>{!counts.maintenance.size&&<p className={followUp.empty}>No rooms with maintenance defects yet.</p>}
  </section>
  <section className={`${followUp.panel} ${statusTable.panel}`} aria-labelledby="cleaner-status-title">
   <header className={followUp.header}><div className={followUp.heading}><span className={followUp.icon}><Sparkles size={20}/></span><div><span className={followUp.eyebrow}>CHECK-OUT ROOMS</span><h2 id="cleaner-status-title">Cleaner Status Table</h2><p>Room cleaning progress by cleaner.</p></div></div></header>
   <div className={`${followUp.scroll} ${statusTable.scroll}`} role="region" aria-labelledby="cleaner-status-title" tabIndex={0}><table className={`${followUp.table} ${statusTable.table}`} aria-labelledby="cleaner-status-title"><thead><tr><th scope="col">Cleaner</th><th scope="col">Total rooms</th><th scope="col">Completed</th><th scope="col">Completed today</th><th scope="col">In progress</th></tr></thead><tbody>{[...counts.cleaners].map(([id,r])=><tr key={id}><th scope="row">{r.name}</th><td>{r.total}</td><td>{r.completed}</td><td>{r.today}</td><td>{r.active}</td></tr>)}{counts.awaitingCleaning>0&&<tr><th scope="row">Awaiting assign</th><td>{counts.awaitingCleaning}</td><td>0</td><td>0</td><td>0</td></tr>}</tbody></table></div>{!counts.cleaningTotal&&!counts.awaitingCleaning&&<p className={followUp.empty}>No rooms handed to cleaning yet.</p>}
  </section>
  {details && (
    <section className={`${followUp.panel} ${statusTable.panel}`} aria-labelledby="checkout-room-report-title">
      <header className={followUp.header}>
        <div className={followUp.heading}>
          <span className={followUp.icon}><ClipboardList size={20} aria-hidden="true" /></span>
          <div>
            <span className={followUp.eyebrow}>CHECK-OUT ROOMS</span>
            <h2 id="checkout-room-report-title">Maintenance &amp; Cleaner Room Report</h2>
          </div>
        </div>
      </header>
      {report.rooms.length ? (
        <div className={`${followUp.scroll} ${statusTable.scroll}`} role="region" aria-labelledby="checkout-room-report-title" tabIndex={0}>
          <table className={`${followUp.table} ${statusTable.table}`} aria-labelledby="checkout-room-report-title">
            <thead>
              <tr>
                <th scope="col">Room</th>
                <th scope="col">Maintenance</th>
                <th scope="col">Repair status</th>
                <th scope="col">Cleaner</th>
                <th scope="col">Cleaning status</th>
                <th scope="col">Completed today</th>
              </tr>
            </thead>
            <tbody>
              {report.rooms.map((room) => {
                const repairStatus = room.repair_percent === 100
                  ? 'Completed'
                  : !room.assigned_to
                    ? 'Awaiting assign'
                    : room.maintenance_status === 'Awaiting inspection' ? 'In Progress' : room.maintenance_status;
                const awaitingCleaner = counts.awaitingCleaningIds.has(room.id) || room.cleaner_status === 'Awaiting assignment';
                const completedToday = [
                  room.maintenance_today && 'Maintenance',
                  room.cleaner_today && 'Cleaner',
                ].filter(Boolean).join(', ');

                return (
                  <tr key={room.id}>
                    <th scope="row">
                      <Link className={statusTable.roomLink} href={`/admin/checkouts/${room.id}`}>
                        Block {room.block} · {room.room_no}
                      </Link>
                    </th>
                    <td>{room.maintenance}</td>
                    <td>{repairStatus} · {room.repair_percent}%</td>
                    <td>{room.cleaner}</td>
                    <td>{awaitingCleaner ? 'Awaiting assign' : room.cleaner_status}</td>
                    <td>{completedToday || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={followUp.empty}>No check-out rooms yet.</p>
      )}
    </section>
  )}
 </section>;
}
