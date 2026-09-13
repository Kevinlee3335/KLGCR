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

  return <AppShell profile={profile} title="Notifications">
    <div className="section-head"><div><h2>Attention Centre</h2><p className="subtle">One place to see items that need Admin follow-up.</p></div></div>
    <div className="metrics">{cards.map(([label,value,href,note])=><Link href={href} key={label} className="panel metric metric-link"><span className="subtle">{label}</span><div className="value">{value}</div><small>{note}</small></Link>)}</div>
    <section id="tenant-not-available" className="panel list-panel" style={{marginTop:18}}>
      <div className="section-head"><div><h3>Tenant Not Available</h3><p className="subtle">Open appointments waiting for Admin to arrange another visit.</p></div></div>
      {tenantNoShows.length===0
        ? <div className="empty"><strong>No tenant no-show appointments need attention.</strong></div>
        : tenantNoShows.map((row)=>{
          const occurred=formatMalaysiaActivity(row.attended_at||`${row.appointment_date}T${row.appointment_time}+08:00`);
          return <Link className="list-row" href={`/admin/jobs/${row.job!.id}`} key={row.id}>
            <div>
              <div className="actions"><strong>{row.job!.job_no}</strong><span className="badge">Needs rescheduling</span></div>
              <p>Block {row.job!.block?.code} · {row.job!.room_no} · Appointment {row.appointment_date} {row.appointment_time.slice(0,5)}</p>
              <small className="subtle">Recorded {occurred.date}, {occurred.time}{row.attendee?.full_name?` by ${row.attendee.full_name}`:""}</small>
              {row.no_show_remarks&&<p>{row.no_show_remarks}</p>}
            </div>
          </Link>;
        })}
    </section>
  </AppShell>;
}
