import Link from "next/link";
import {AppShell} from "@/components/app-shell";
import {requireRole} from "@/lib/auth";
import {CheckoutABInspector} from "@/components/checkout-ab-inspector";
export default async function Page(){
 const profile=await requireRole(["admin"]);
 return <AppShell profile={profile} title="Room Inspection · Block A & B"><div className="section-head"><div><p className="eyebrow">Check-out Rooms</p><h2>Room Inspection · Block A & B</h2><p className="subtle">Default Good. Mark defects, add photos and submit to the Check-out Progress Table.</p></div><Link className="button secondary" href="/admin/checkouts">Back to Check-out Rooms</Link></div><CheckoutABInspector/></AppShell>;
}
