import Link from "next/link";
import {AppShell} from "@/components/app-shell";
import {requireCheckoutInspector} from "@/lib/auth";
import {CheckoutABInspector} from "@/components/checkout-ab-inspector";
export default async function Page(){
 const profile=await requireCheckoutInspector();
 const admin=profile.role==="admin";
 return <AppShell profile={profile} title={admin?"Room Inspection · Block A & B":"Pemeriksaan Bilik · Blok A & B"}><div className="section-head"><div><p className="eyebrow">{admin?"Check-out Rooms":"Bilik Daftar Keluar"}</p><h2>{admin?"Room Inspection · Block A & B":"Pemeriksaan Bilik · Blok A & B"}</h2><p className="subtle">{admin?"Default Good. Mark defects, add photos and submit to the Check-out Progress Table.":"Keadaan asal ialah Baik. Tandakan kerosakan, tambah gambar dan hantar pemeriksaan."}</p></div><Link className="button secondary" href={admin?"/admin/checkouts":"/staff/checkouts"}>{admin?"Back to Check-out Rooms":"Kembali ke Bilik Daftar Keluar"}</Link></div><CheckoutABInspector isAdmin={admin}/></AppShell>;
}
