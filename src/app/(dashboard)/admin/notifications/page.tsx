import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationsPage(){
  const profile=await requireRole(["admin","management_viewer"]);
  const supabase=await createClient();
  const [{count:newComplaints},{count:pendingMaterial},{count:monitoring},{data:stock}] = await Promise.all([
    supabase.from("complaints").select("id",{count:"exact",head:true}).eq("status","new"),
    supabase.from("maintenance_jobs").select("id",{count:"exact",head:true}).eq("status","pending_material"),
    supabase.from("maintenance_jobs").select("id",{count:"exact",head:true}).eq("status","under_monitoring"),
    supabase.from("inventory_items").select("id,balance_qty,reorder_level").eq("is_active",true),
  ]);
  const out=(stock??[]).filter(i=>Number(i.balance_qty)===0).length;
  const near=(stock??[]).filter(i=>Number(i.balance_qty)>0&&Number(i.balance_qty)<=Number(i.reorder_level)).length;
  const cards=[
    ["New Complaints",newComplaints??0,"/admin/complaints?status=new","Needs Admin review before assignment."],
    ["Pending Material",pendingMaterial??0,"/admin/jobs?status=pending_material","Jobs waiting for material."],
    ["Under Monitoring",monitoring??0,"/admin/jobs?status=under_monitoring","Jobs waiting for follow-up monitoring."],
    ["Out of Stock",out,"/admin/inventory","Inventory balance is zero."],
    ["Near Reorder",near,"/admin/inventory","Inventory has reached reorder level."],
  ] as const;
  return <AppShell profile={profile} title="Notifications"><div className="section-head"><div><h2>Attention Centre</h2><p className="subtle">One place to see items that need Admin follow-up.</p></div></div><div className="metrics">{cards.map(([label,value,href,note])=><Link href={href} key={label} className="panel metric metric-link"><span className="subtle">{label}</span><div className="value">{value}</div><small>{note}</small></Link>)}</div></AppShell>;
}
