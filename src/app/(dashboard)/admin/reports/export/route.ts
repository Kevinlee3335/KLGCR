/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function csvCell(value: unknown) { return `"${String(value ?? "").replaceAll('"','""')}"`; }
function htmlEscape(value: unknown) { return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }
function malaysiaDayRange(date:string){ return [`${date}T00:00:00+08:00`,`${date}T23:59:59.999+08:00`]; }
function download(rows: unknown[][], headers:string[], format:string, filename:string){
  if(format==="xls"){
    const html=`<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1"><tr>${headers.map(h=>`<th>${htmlEscape(h)}</th>`).join("")}</tr>${rows.map(r=>`<tr>${r.map(v=>`<td>${htmlEscape(v)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
    return new Response(html,{headers:{"Content-Type":"application/vnd.ms-excel; charset=utf-8","Content-Disposition":`attachment; filename=${filename}.xls`}});
  }
  const csv=[headers.map(csvCell).join(","),...rows.map(r=>r.map(csvCell).join(","))].join("\r\n");
  return new Response(`\ufeff${csv}`,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename=${filename}.csv`}});
}

export async function GET(request: Request) {
  await requireRole(["admin","management_viewer"]);
  const supabase=await createClient();
  const db:any=supabase;
  const params=new URL(request.url).searchParams;
  const date=params.get("date")??"";
  const block=params.get("block")??"";
  const reportType=params.get("reportType")??"";
  const staff=params.get("staff")??"";
  const dataset=params.get("dataset")??"reports";
  const format=params.get("format")==="xls"?"xls":"csv";

  if(dataset==="appointments"){
    let query=db.from("appointments").select("appointment_date,appointment_time,status,assigned_staff,complaints!appointment_complaint_id_fkey(complaint_no,room_no,room_access_permission,appointment_required,blocks(code)),profiles!appointments_assigned_staff_fkey(full_name)").order("appointment_date",{ascending:false});
    if(date)query=query.eq("appointment_date",date);if(staff)query=query.eq("assigned_staff",staff);
    const {data,error}=await query;if(error)return new Response(error.message,{status:500});
    const rows:unknown[][]=(data??[]).filter((r:any)=>!block||block==="ALL"||block.includes(r.complaints?.blocks?.code??"")).map((r:any)=>[r.appointment_date,r.appointment_time,r.complaints?.complaint_no,r.complaints?.blocks?.code,r.complaints?.room_no,r.profiles?.full_name,String(r.complaints?.room_access_permission??"").toUpperCase(),r.complaints?.appointment_required?"Yes":"No",String(r.status).replaceAll("_"," ")]);
    return download(rows,["Appointment Date","Appointment Time","Complaint","Block","Room","Assigned Staff","Room Access Permission","Appointment Required","Appointment Status"],format,"KLGCR-Appointments");
  }

  if(dataset==="material_usage"||dataset==="consumption"){
    let query=db.from("inventory_issue_history").select("id,qty,issued_at,staff_id,inventory_items(item_code,description,unit),maintenance_jobs(job_no,room_no,blocks(code)),profiles!inventory_issue_history_staff_id_fkey(full_name)").order("issued_at",{ascending:false}).limit(1000);
    if(staff)query=query.eq("staff_id",staff);
    if(date){const [from,to]=malaysiaDayRange(date);query=query.gte("issued_at",from).lte("issued_at",to);}
    const {data,error}=await query;
    if(error)return new Response(error.message,{status:500});
    const filtered=(data??[]).filter((r:any)=>!block||block==="ALL"||block.includes(r.maintenance_jobs?.blocks?.code??""));
    if(dataset==="consumption"){
      const totals=new Map<string,{description:string;qty:number;unit:string}>();
      for(const r of filtered){
        const code=r.inventory_items?.item_code??"Unknown";
        const cur=totals.get(code)??{description:r.inventory_items?.description??"",qty:0,unit:r.inventory_items?.unit??""};
        cur.qty+=Number(r.qty??0);
        totals.set(code,cur);
      }
      const rows:unknown[][]=[...totals.entries()].sort((a,b)=>b[1].qty-a[1].qty).map(([code,v])=>[code,v.description,v.qty,v.unit]);
      return download(rows,["Item Code","Description","Total Used","Unit"],format,"KLGCR-Consumption-Analysis");
    }
    const rows:unknown[][]=filtered.map((r:any)=>[r.issued_at,r.inventory_items?.item_code,r.inventory_items?.description,r.qty,r.inventory_items?.unit,r.maintenance_jobs?.job_no,r.maintenance_jobs?.blocks?.code,r.maintenance_jobs?.room_no,r.profiles?.full_name]);
    return download(rows,["Issued At","Item Code","Description","Qty","Unit","Job No","Block","Room","Staff"],format,"KLGCR-Material-Usage");
  }

  if(dataset==="inventory_transactions"){
    let query=db.from("inventory_adjustment_history").select("adjusted_at,adjustment_type,qty,balance_before,balance_after,note,inventory_items(item_code,description,unit)").order("adjusted_at",{ascending:false}).limit(1000);
    if(date){const [from,to]=malaysiaDayRange(date);query=query.gte("adjusted_at",from).lte("adjusted_at",to);}
    const {data,error}=await query;
    if(error)return new Response(error.message,{status:500});
    const rows:unknown[][]=(data??[]).map((r:any)=>[r.adjusted_at,r.inventory_items?.item_code,r.inventory_items?.description,r.adjustment_type,r.qty,r.inventory_items?.unit,r.balance_before,r.balance_after,r.note]);
    return download(rows,["Adjusted At","Item Code","Description","Type","Qty","Unit","Balance Before","Balance After","Note"],format,"KLGCR-Inventory-Transactions");
  }

  let query=db.from("report_snapshots").select("report_date,report_type,block_group,source,created_at,whatsapp_text").order("created_at",{ascending:false}).limit(500);
  if(date)query=query.eq("report_date",date);
  if(block)query=query.eq("block_group",block);
  if(reportType)query=query.eq("report_type",reportType);
  const {data,error}=await query;
  if(error)return new Response(error.message,{status:500});
  const rows:unknown[][]=(data??[]).map((r:any)=>[r.report_date,r.report_type,r.block_group,r.source,r.created_at,r.whatsapp_text]);
  return download(rows,["Date","Type","Block Group","Source","Created At","WhatsApp Summary"],format,"KLGCR-Reports");
}
