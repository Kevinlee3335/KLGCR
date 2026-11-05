import Link from "next/link";
import {AppShell} from "@/components/app-shell";
import {requireCheckoutInspector} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {CheckoutABInspector} from "@/components/checkout-ab-inspector";
export default async function Page(){
 const profile=await requireCheckoutInspector();
 const admin=profile.role==="admin";
 const db=await createClient();
 const inspections:{checklist:unknown;created_at:string}[]=[];
 let loadError=false;
 for(let offset=0;;offset+=500){
  const {data,error}=await db.from("checkout_rooms").select("inspection_checklist,created_at").is("deleted_at",null).not("inspection_checklist","is",null).order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+499);
  if(error){loadError=true;break;}
  inspections.push(...(data||[]).map(row=>({checklist:row.inspection_checklist,created_at:row.created_at})));
  if(!data||data.length<500)break;
 }
 return <AppShell profile={profile} title={admin?"Room Inspection · Block A & B":"Pemeriksaan Bilik · Blok A & B"}><div className="section-head"><div><p className="eyebrow">{admin?"Check-out Rooms":"Bilik Daftar Keluar"}</p><h2>{admin?"Room Inspection · Block A & B":"Pemeriksaan Bilik · Blok A & B"}</h2><p className="subtle">{admin?"Default Good. Mark defects, add photos and submit to the Check-out Progress Table.":"Keadaan asal ialah Baik. Tandakan kerosakan, tambah gambar dan hantar pemeriksaan."}</p></div><Link className="button secondary" href={admin?"/admin/checkouts":"/staff/checkouts"}>{admin?"Back to Check-out Rooms":"Kembali ke Bilik Daftar Keluar"}</Link></div><CheckoutABInspector isAdmin={admin} initialInspections={inspections} loadError={loadError}/></AppShell>;
}
