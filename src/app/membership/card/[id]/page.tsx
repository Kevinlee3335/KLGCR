import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { memberStatus, membershipEnabled } from "@/lib/membership";
export default async function CardPage({ params }: {params:Promise<{id:string}>}) {
 const {id} = await params;
 if (!membershipEnabled() || !/^[a-f0-9-]{36}$/.test(id)) notFound();
 const {data, error} = await createAdminClient().from("memberships").select("id,status,starts_on,expires_on").eq("id",id).maybeSingle();
 if (error) throw new Error("Membership verification is temporarily unavailable.");
 if (!data) notFound();
 return <section className="panel"><p className="eyebrow">MEMBERSHIP VERIFICATION</p><h1>{id.slice(0,8).toUpperCase()}</h1><p className="member-status">{memberStatus(data)}</p><p>Valid from: <strong>{data.starts_on || "—"}</strong></p><p>Valid until: <strong>{data.expires_on || "Pending approval"}</strong></p><p>This QR verifies membership status only. It does not operate the access card reader.</p></section>;
}
