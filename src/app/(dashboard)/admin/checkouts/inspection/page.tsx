import Link from "next/link";
import {AppShell} from "@/components/app-shell";
import {requireCheckoutInspector} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {CheckoutABInspector} from "@/components/checkout-ab-inspector";
import {inspectionRepairKeys} from "@/lib/checkout-inspection";
import type {CDInspection} from "@/lib/checkout-cd-inspection";
export default async function Page({searchParams}:{searchParams:Promise<{blocks?:string}>}){
 const blocks=(await searchParams).blocks==="CD"?"CD":"AB";
 const label=blocks==="CD"?"C & D":"A & B";
 const profile=await requireCheckoutInspector();
 const admin=profile.role==="admin";
 const db=await createClient();
 const inspections:{checklist:unknown;created_at:string;rectifiedItems:string[]}[]=[];
 let loadError=false;
 for(let offset=0;;offset+=500){
  const {data,error}=await db.from("checkout_rooms").select("inspection_checklist,created_at,checkout_defects(description,status)").is("deleted_at",null).not("inspection_checklist","is",null).order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+499);
  if(error){loadError=true;break;}
  inspections.push(...(data||[]).map(row=>({checklist:row.inspection_checklist,created_at:row.created_at,rectifiedItems:inspectionRepairKeys(row.inspection_checklist,row.checkout_defects||[])})));
  if(!data||data.length<500)break;
 }
 if(blocks==="CD"){
  const checklists=inspections.map(row=>row.checklist as CDInspection).filter(row=>row&&["C","D"].includes(row.b));
  const paths=[...new Set(checklists.flatMap(row=>Object.values(row.ph||{}).flat()))];
  if(paths.length){
   const {data,error}=await db.storage.from("checkout-evidence").createSignedUrls(paths,3600);
   if(error)loadError=true;
   const urls=new Map((data||[]).map(photo=>[photo.path,photo.signedUrl]));
   for(const row of checklists)for(const key of Object.keys(row.ph||{}))row.ph![key]=row.ph![key].flatMap(path=>urls.get(path)?[urls.get(path)!]:[]);
  }
 }
 return <AppShell profile={profile} title={admin?`Room Inspection · Block ${label}`:`Pemeriksaan Bilik · Blok ${label}`}><div className="section-head"><div><p className="eyebrow">{admin?"Check-out Rooms":"Bilik Daftar Keluar"}</p><h2>{admin?`Room Inspection · Block ${label}`:`Pemeriksaan Bilik · Blok ${label}`}</h2><p className="subtle">{admin?(blocks==="CD"?"Check each item, add photos and submit to the Check-out Progress Table.":"Default Good. Mark defects, add photos and submit to the Check-out Progress Table."):"Keadaan asal ialah Baik. Tandakan kerosakan, tambah gambar dan hantar pemeriksaan."}</p></div><Link className="button secondary" href={admin?"/admin/checkouts":"/staff/checkouts"}>{admin?"Back to Check-out Rooms":"Kembali ke Bilik Daftar Keluar"}</Link></div><div className="checkout-page-actions" style={{marginBottom:16}}><Link className={`button ${blocks==="AB"?"":"secondary"}`} aria-current={blocks==="AB"?"page":undefined} href="/admin/checkouts/inspection">Block A &amp; B</Link><Link className={`button ${blocks==="CD"?"":"secondary"}`} aria-current={blocks==="CD"?"page":undefined} href="/admin/checkouts/inspection?blocks=CD">Block C &amp; D</Link></div><CheckoutABInspector key={blocks} blocks={blocks} isAdmin={admin} initialInspections={inspections.filter(row=>blocks.includes((row.checklist as {b?:string})?.b||"_"))} loadError={loadError}/></AppShell>;
}
