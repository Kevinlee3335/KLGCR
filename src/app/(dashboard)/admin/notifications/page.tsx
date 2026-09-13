import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { unresolvedTenantNoShows, type TenantNoShowNotification } from "@/lib/admin-notifications";
import { formatMalaysiaActivity } from "@/lib/job-activity";

export default async function NotificationsPage(){
  const profile=await requireRole(["admin","management_viewer"]);
  const supabase=await createClient();
  const [{count:newComplaints},{count:pendingMaterial},{count:monitoring},{data:stock},{data:noShowRows,error:noShowError}] = await Promise.all([
    supabase.from("complaints").select("id",{count:"exact",head:true}).eq("status","new"),
    supabase.from("maintenance_jobs").select("id",{count:"exact",head:true}).eq("status","pending_material"),
    supabase.from("maintenance_jobs").select("id",{count:"exact",head:true}).eq("status","under_monitoring"),
    supabase.from("inventory_items").select("id,balance_qty,reorder_level").eq("is_active",true),
    supabase.from("appointments")
      .select("id,job_id,appointment_date,appointment_time,attended_at,no_show_remarks,attendee:profiles!appointments_attended_by_fkey(full_name),job:maintenance_jobs!appointments_job_id_fkey(id,job_no,status,room_no,block:blocks!block_id(code))")
      .eq("status","no_show")
      .order("attended_at",{ascending:false}),
  ]);
  if(noShowError) console.error("Tenant no-show notifications could not be loaded",noShowError.message);

  const noShows=(noShowRows??[]) as unknown as TenantNoShowNotification[];
  const openNoShowJobIds=[...new Set(noShows.filter((row)=>row.job&&!["completed","cancelled"].includes(row.job.status)).map((row)=>row.job_id))];
  const {data:activeAppointmentRows}=openNoShowJobIds.length
    ? await supabase.from("appointments").select("job_id").in("job_id",openNoShowJobIds).in("status",["pending_confirmation","confirmed"])
    : {data:[] as {job_id:string}[]};
  const tenantNoShows=unresolvedTenantNoShows(noShows,(activeAppointmentRows??[]).map((row)=>row.job_id));

  const out=(stock??[]).filter(i=>Number(i.balance_qty)===0).length;
  const near=(stock??[]).filter(i=>Number(i.balance_qty)>0&&Number(i.balance_qty)<=Number(i.reorder_level)).length;
  const cards=[
    ["New Complaints",newComplaints??0,"/admin/complaints?status=new","Needs Admin review before assignment."],
    ["Tenant Not Available",tenantNoShows.length,"/admin/notifications#tenant-not-available","Appointments that need Admin rescheduling."],
    ["Pending Material",pendingMaterial??0,"/admin/jobs?status=pending_material","Jobs waiting for material."],
    ["Under Monitoring",monitoring??0,"/admin/jobs?status=under_monitoring","Jobs waiting for follow-up monitoring."],
    ["Out of Stock",out,"/admin/inventory","Inventory balance is zero."],
    ["Near Reorder",near,"/admin/inventory","Inventory has reached reorder level."],
  ] as const;

  const summaryCards=[
    ["New Complaints",newComplaints??0,"/admin/complaints?status=new","Waiting for review","blue"],
    ["Tenant Not Available",tenantNoShows.length,"#tenant-not-available","Needs another appointment","danger"],
    ["Pending Material",pendingMaterial??0,"/admin/jobs?status=pending_material","Waiting for stock","amber"],
    ["Under Monitoring",monitoring??0,"/admin/jobs?status=under_monitoring","Follow-up required","purple"],
    ["Out of Stock",out,"/admin/inventory","No balance available","danger"],
    ["Near Reorder",near,"/admin/inventory","At reorder level","gold"],
  ] as const;

  return <AppShell profile={profile} title="Notifications">
    <div className="notification-centre">
      <header className="notification-hero">
        <div><p className="eyebrow">Operations alerts</p><h2>Attention Centre</h2><p>Items that need Admin review, rescheduling or follow-up.</p></div>
        <div className="notification-total"><span>Open alerts</span><strong>{(newComplaints??0)+tenantNoShows.length+(pendingMaterial??0)+(monitoring??0)+out+near}</strong></div>
      </header>

      <section className="notification-summary-grid" aria-label="Notification summary">
        {summaryCards.map(([label,value,href,note,tone])=><Link href={href} key={label} className={`notification-summary-card notification-${tone}`}>
          <span>{label}</span><strong>{value}</strong><small>{note}</small>
        </Link>)}
      </section>

      <section id="tenant-not-available" className="tenant-notification-panel">
        <div className="tenant-notification-head">
          <div><p className="eyebrow">Appointment attention</p><h3>Tenant Not Available</h3><p>Arrange another visit for every open item below.</p></div>
          <span className="tenant-notification-count">{tenantNoShows.length} open</span>
        </div>
        {tenantNoShows.length===0
          ? <div className="notification-empty"><strong>All tenant visits are up to date</strong><span>No appointments currently need rescheduling.</span></div>
          : <div className="tenant-notification-list">{tenantNoShows.map((row)=>{
            const occurred=formatMalaysiaActivity(row.attended_at||`${row.appointment_date}T${row.appointment_time}+08:00`);
            return <Link href={`/admin/jobs/${row.job!.id}`} key={row.id} className="tenant-notification-row">
              <div className="tenant-notification-location"><span>Block {row.job!.block?.code??"–"}</span><strong>{row.job!.room_no}</strong></div>
              <div className="tenant-notification-main">
                <div><strong>{row.job!.job_no}</strong><span className="status-badge status-pending_material">Needs rescheduling</span></div>
                <p>Original appointment: {row.appointment_date} at {row.appointment_time.slice(0,5)}</p>
                <small>Reported {occurred.date}, {occurred.time}{row.attendee?.full_name?` by ${row.attendee.full_name}`:""}</small>
                {row.no_show_remarks&&<blockquote>{row.no_show_remarks}</blockquote>}
              </div>
              <span className="tenant-notification-action">Open job →</span>
            </Link>;
          })}</div>}
      </section>
    </div>
  </AppShell>;
}
