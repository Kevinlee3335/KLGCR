"use client";

import {useEffect,useRef} from "react";
import {ClipboardCheck,History,Sparkles,Wrench,X} from "lucide-react";
import Link from "next/link";
import type {getRecentRoomInspection} from "@/app/(dashboard)/admin/checkouts/inspection/actions";
import styles from "./recent-room-inspection-dialog.module.css";

export type RecentInspection = NonNullable<Awaited<ReturnType<typeof getRecentRoomInspection>>["record"]>;

function formatDate(value:string) {
 const date=new Date(value);
 const zone={timeZone:"Asia/Kuala_Lumpur"};
 const day=new Intl.DateTimeFormat("en-GB",{...zone,day:"numeric",month:"short",year:"numeric"}).format(date);
 if(value.length===10) return day;
 const time=new Intl.DateTimeFormat("en-MY",{...zone,hour:"numeric",minute:"2-digit",hour12:true}).format(date);
 return `${day} · ${time.toUpperCase()}`;
}

export function RecentRoomInspectionDialog({room,record,onClose,onContinue}:{
 room:string;record:RecentInspection;onClose:()=>void;onContinue:()=>void;
}) {
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const element=dialog.current;
  element?.showModal();
  return ()=>element?.close();
 },[]);
 const repairStatus=record.defectCount===0?"No Defect":record.remaining?"Pending":"Completed";
 const repairDetail=record.remaining?`${record.remaining} ${record.remaining===1?"defect":"defects"} remaining`:
  record.defectCount&&record.repairedAt?formatDate(record.repairedAt):null;
 const cleaningStatus=record.status==="ready_for_occupancy"&&record.cleanedAt?"Completed":
  record.status==="cleaning"?"In Progress":record.status==="verification"||(!record.defectCount&&record.status==="second_inspection")?"Awaiting Cleaner":"Pending";
 const rows=[
  {label:"Last Inspection",icon:ClipboardCheck,detail:formatDate(record.inspectedAt)},
  {label:"Defect Rectification",icon:Wrench,detail:repairDetail,status:repairStatus},
  {label:"Cleaning",icon:Sparkles,detail:cleaningStatus==="Completed"&&record.cleanedAt?formatDate(record.cleanedAt):null,status:cleaningStatus},
 ];
 return <dialog ref={dialog} className={styles.dialog} aria-labelledby="recent-room-title"
  onCancel={event=>{event.preventDefault();onClose();}}
  onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
  <div className={styles.content}>
   <div className={styles.heading}>
    <span className={styles.emblem}><History aria-hidden="true"/></span>
    <button type="button" className={styles.close} aria-label="Close inspection notice" onClick={onClose}><X aria-hidden="true"/></button>
   </div>
   <h2 id="recent-room-title">{room} was recently inspected</h2>
   <p className={styles.subtitle}>This room was inspected within the last 30 days.</p>
   <ul className={styles.timeline}>
    {rows.map(({label,icon:Icon,detail,status})=><li key={label}>
     <Icon aria-hidden="true" size={21}/>
     <div><strong>{label}</strong>{detail&&<span>{detail}</span>}</div>
     {status&&<span className={status==="Completed"||status==="No Defect"?styles.complete:styles.pending}>{status}</span>}
    </li>)}
   </ul>
   <div className={styles.actions}>
    <Link className={styles.primary} href={`/admin/checkouts/${record.id}`} target="_blank" rel="noopener" autoFocus>View Previous Record</Link>
    <button type="button" onClick={onContinue}>Continue Inspection</button>
   </div>
  </div>
 </dialog>;
}
