import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, ArchiveRestore, ClipboardList, Clock3,
  FileText, History, Search, ShieldCheck, Sparkles, Wrench
} from "lucide-react";
import {AppShell} from "@/components/app-shell";
import {requireSuperAdmin} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {manageCheckoutAsSuperAdmin} from "./actions";
import styles from "./super-admin.module.css";

type Params={q?:string;error?:string;result?:string};
type Job={id:string;job_no:string;status:string;room_no:string;category:string};
type Room={id:string;reference_no:string;room_no:string;status:string;deleted_at?:string|null;deletion_reason?:string|null;block:{code:string}|null};
type Complaint={id:string;complaint_no:string;status:string;room_no:string;category:string};
type Audit={id:number;operation:string;entity_type:string;reason:string;created_at:string};
type RecordGroupProps={
 id:string;eyebrow:string;title:string;subtitle:string;count:number;
 icon:React.ReactNode;children:React.ReactNode
};

function RecordGroup({id,eyebrow,title,subtitle,count,icon,children}:RecordGroupProps){
 return <section id={id} className={styles.module}>
   <header className={styles.moduleHeader}>
    <div className={styles.moduleTitleGroup}>
     <span className={styles.moduleIcon}>{icon}</span>
     <div><span className={styles.overline}>{eyebrow}</span><h3>{title}</h3><p>{subtitle}</p></div>
    </div>
    <span className={styles.count}>{count} shown</span>
   </header>
   <div className={styles.records}>{children}</div>
 </section>;
}
function Status({value}:{value:string}){
 const label=value.replaceAll("_"," ");
 const tone=["completed","closed","ready_for_occupancy"].includes(value)
  ?styles.statusDone
  :["cancelled","rejected"].includes(value)?styles.statusInactive
  :["under_monitoring","pending_material"].includes(value)?styles.statusAttention
  :styles.statusWorking;
 return <span className={`${styles.status} ${tone}`}><span className={styles.statusDot}/>{label}</span>;
}
function Empty({text}:{text:string}){
 return <div className={styles.empty}><Search size={16}/><span>{text}</span></div>;
}
function formatMalaysia(value:string){
 return new Date(value).toLocaleString("en-MY",{
  timeZone:"Asia/Kuala_Lumpur",day:"2-digit",month:"short",year:"numeric",
  hour:"2-digit",minute:"2-digit",hour12:true
 });
}

export default async function SuperAdminPage({searchParams}:{searchParams:Promise<Params>}) {
 const profile=await requireSuperAdmin();
 const params=await searchParams;
 const search=String(params.q||"").trim().replace(/[^a-zA-Z0-9-]/g,"").slice(0,50);
 const db=await createClient();
 let jobsQuery=db.from("maintenance_jobs")
  .select("id,job_no,status,room_no,category")
  .order("updated_at",{ascending:false}).limit(25);
 let roomsQuery=db.from("checkout_rooms")
  .select("id,reference_no,room_no,status,deleted_at,block:blocks!block_id(code)")
  .is("deleted_at",null).order("updated_at",{ascending:false}).limit(25);
 let complaintsQuery=db.from("complaints")
  .select("id,complaint_no,status,room_no,category")
  .order("updated_at",{ascending:false}).limit(25);

 if(search){
  jobsQuery=jobsQuery.or(`job_no.ilike.%${search}%,room_no.ilike.%${search}%`);
  roomsQuery=roomsQuery.or(`reference_no.ilike.%${search}%,room_no.ilike.%${search}%`);
  complaintsQuery=complaintsQuery.or(`complaint_no.ilike.%${search}%,room_no.ilike.%${search}%`);
 }

 const [
  {data:jobs,error:jobError},
  {data:rooms,error:roomError},
  {data:complaints,error:complaintError},
  {data:archived,error:archiveError},
  {data:audit,error:auditError}
 ]=await Promise.all([
  jobsQuery,
  roomsQuery,
  complaintsQuery,
  db.from("checkout_rooms")
   .select("id,reference_no,room_no,status,deleted_at,deletion_reason,block:blocks!block_id(code)")
   .not("deleted_at","is",null).order("deleted_at",{ascending:false}).limit(15),
  db.from("super_admin_audit")
   .select("id,operation,entity_type,reason,created_at")
   .order("created_at",{ascending:false}).limit(20)
 ]);
 const activeJobs=(jobs||[]) as Job[];
 const activeRooms=(rooms||[]) as unknown as Room[];
 const activeComplaints=(complaints||[]) as Complaint[];
 const archivedRooms=(archived||[]) as unknown as Room[];
 const audits=(audit||[]) as Audit[];
 const fault=params.error||jobError?.message||roomError?.message||
  complaintError?.message||archiveError?.message||auditError?.message;

 return <AppShell profile={profile} title="Super Admin Control Center">
  <div className={styles.page}>
   <section className={styles.hero}>
    <div className={styles.heroContent}>
     <span className={styles.heroEyebrow}><ShieldCheck size={15}/> KLGCR · EXCLUSIVE ACCESS</span>
     <h2>Super Admin <span>Control Center</span></h2>
     <p>One place to oversee maintenance, housekeeping and record corrections.
      Every override is protected and recorded.</p>
     <div className={styles.heroFoot}>
      <span className={styles.access}><span className={styles.accessDot}/> Full operational access</span>
      <span className={styles.heroUser}>KEVIN · SUPER ADMIN</span>
     </div>
    </div>
    <div className={styles.heroEmblem} aria-hidden="true"><ShieldCheck size={106} strokeWidth={0.75}/></div>
   </section>

   <nav className={styles.jumpNav} aria-label="Control center sections">
    <a href="#maintenance"><Wrench size={14}/> Maintenance</a>
    <a href="#housekeeping"><ClipboardList size={14}/> Check-out Rooms</a>
    <a href="#complaints"><FileText size={14}/> Complaints</a>
    <a href="#archive"><ArchiveRestore size={14}/> Archive</a>
    <a href="#activity"><History size={14}/> Audit History</a>
   </nav>

   {fault&&<p className={styles.error} role="alert">{fault}</p>}
   {params.result&&<p className={styles.success} role="status">
     {params.result==="archive_duplicate"?"Duplicate record safely archived."
      :params.result==="restore_archived"?"Archived record successfully restored."
      :"Super Admin change saved."}
    </p>}

   <section className={styles.finder} aria-labelledby="find-record-title">
    <div className={styles.finderCopy}>
     <span className={styles.searchIcon}><Search size={17}/></span>
     <div><h3 id="find-record-title">Find a record</h3>
      <p>Search by room number, Job ID or Complaint reference</p></div>
    </div>
    <form className={styles.searchForm} method="get" role="search">
     <Search size={17} className={styles.searchGlyph} aria-hidden="true"/>
     <input name="q" aria-label="Search jobs, complaints and rooms" defaultValue={search}
      placeholder="e.g. B601 or KLGCR-JOB-2026-0209" autoComplete="off"/>
     <button type="submit">Search <ArrowRight size={15}/></button>
     {search&&<Link href="/admin/super-admin" className={styles.clear}>Clear</Link>}
    </form>
   </section>

   <div className={styles.layout}>
    <div className={styles.primary}>
     <RecordGroup id="maintenance" eyebrow="OPERATIONS / 01" title="Maintenance Jobs"
      subtitle="Update progress on behalf of the maintenance team"
      count={activeJobs.length} icon={<Wrench size={19}/>}>
      {activeJobs.map(job=><Link className={styles.record} key={job.id} href={`/admin/jobs/${job.id}`}>
       <span className={styles.recordContent}><strong>{job.job_no}</strong>
        <small>{job.room_no} <span>·</span> {job.category}</small></span>
       <Status value={job.status}/>
       <ArrowUpRight className={styles.recordArrow} size={17}/>
      </Link>)}
      {!activeJobs.length&&<Empty text="No matching maintenance jobs"/>}
     </RecordGroup>

     <RecordGroup id="housekeeping" eyebrow="ROOM TURNOVER / 02" title="Check-out Rooms"
      subtitle="Cleaner completion, reassignment and duplicate archive"
      count={activeRooms.length} icon={<ClipboardList size={19}/>}>
      {activeRooms.map(room=><Link className={styles.record} key={room.id}
        href={`/admin/checkouts/${room.id}`}>
       <span className={styles.recordContent}><strong>{room.reference_no}</strong>
        <small>Block {room.block?.code||"—"} <span>·</span> Room {room.room_no}</small></span>
       <Status value={room.status}/>
       <ArrowUpRight className={styles.recordArrow} size={17}/>
      </Link>)}
      {!activeRooms.length&&<Empty text="No matching check-out rooms"/>}
     </RecordGroup>

     <RecordGroup id="complaints" eyebrow="CASE RECORDS / 03" title="Complaints"
      subtitle="Review records and remove eligible duplicate reports"
      count={activeComplaints.length} icon={<FileText size={19}/>}>
      {activeComplaints.map(complaint=><Link className={styles.record} key={complaint.id}
       href={`/admin/complaints/${complaint.id}`}>
       <span className={styles.recordContent}><strong>{complaint.complaint_no}</strong>
        <small>{complaint.room_no} <span>·</span> {complaint.category}</small></span>
       <Status value={complaint.status}/>
       <ArrowUpRight className={styles.recordArrow} size={17}/>
      </Link>)}
      {!activeComplaints.length&&<Empty text="No matching complaints"/>}
     </RecordGroup>
     <p className={styles.listNote}>Showing the latest 25 records in each section. Use search to find older records.</p>
    </div>

    <aside className={styles.secondary}>
     <section className={styles.sidePanel} id="archive">
      <div className={styles.sideHeading}>
       <span className={styles.sideIcon}><ArchiveRestore size={19}/></span>
       <div><span className={styles.overline}>RECOVERY</span><h3>Archived Records</h3></div>
       <span className={styles.sideCount}>{archivedRooms.length}</span>
      </div>
      <p className={styles.sideIntro}>Recover an archived room without losing its history or photos.</p>
      <div className={styles.archives}>
      {archivedRooms.map(room=><details className={styles.archive} key={room.id}>
       <summary>
        <span><strong>{room.reference_no}</strong>
         <small>Block {room.block?.code||"—"} · {room.room_no}</small></span>
        <ArrowRight size={16}/>
       </summary>
       <p className={styles.archiveReason}>Reason: {room.deletion_reason||"Not recorded"}</p>
       {room.deleted_at&&<p className={styles.archiveDate}>{formatMalaysia(room.deleted_at)}</p>}
       <form action={manageCheckoutAsSuperAdmin.bind(null,room.id)} className={styles.restoreForm}>
        <input type="hidden" name="operation" value="restore_archived"/>
        <label htmlFor={`restore-${room.id}`}>Restoration reason</label>
        <textarea id={`restore-${room.id}`} name="reason" rows={2}
         minLength={3} maxLength={2000} required
         placeholder="Explain why this record should be restored"/>
        <button type="submit"><ArchiveRestore size={15}/> Restore record</button>
       </form>
      </details>)}
      {!archivedRooms.length&&<div className={styles.sideEmpty}>No archived Check-out records</div>}
      </div>
     </section>

     <section className={styles.sidePanel} id="activity">
      <div className={styles.sideHeading}>
       <span className={styles.sideIcon}><History size={19}/></span>
       <div><span className={styles.overline}>ACCOUNTABILITY</span><h3>Audit History</h3></div>
      </div>
      <p className={styles.sideIntro}>A permanent trail of changes made with Super Admin privileges.</p>
      <div className={styles.auditList}>
      {audits.map(a=><div className={styles.audit} key={a.id}>
       <span className={styles.auditMark}><Clock3 size={13}/></span>
       <div><strong>{a.operation.replaceAll("_"," ")}</strong>
        <small>{a.entity_type.replaceAll("_"," ")} · {formatMalaysia(a.created_at)}</small>
        <p>{a.reason}</p></div>
      </div>)}
      {!audits.length&&<div className={styles.sideEmpty}>No Super Admin overrides recorded</div>}
      </div>
     </section>

     <div className={styles.note}>
      <Sparkles size={15}/><p>All privileged edits require a reason.
       Payment approvals and signatures retain their original verification workflow.</p>
     </div>
    </aside>
   </div>
  </div>
 </AppShell>;
}
