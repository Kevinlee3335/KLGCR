import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { malaysiaDay, membershipEnabled } from "@/lib/membership";
export const dynamic = "force-dynamic";
function csv(value: unknown) { let text = String(value??""); if (/^[\s]*[=+@-]/.test(text)) text = "'"+text; return `"${text.replaceAll('"','""')}"`; }
export async function GET() {
 await requireRole(["admin"]);
 if (!membershipEnabled()) return new Response("Not available",{status:404});
 const db = createAdminClient();
 const rows: string[] = ["Member reference,Name,Email,Room,Expiry,Reason"];
 for (let offset=0;;offset+=500) {
  const {data,error} = await db.from("memberships").select("id,full_name,email,room_no,expires_on,status").or(`status.eq.cancelled,and(status.eq.active,expires_on.lt.${malaysiaDay()})`).order("id").range(offset,offset+499);
  if (error) return new Response("Unable to export member records",{status:500});
  for (const member of data||[]) rows.push([member.id.slice(0,8).toUpperCase(),member.full_name,member.email,member.room_no,member.expires_on,member.status==="cancelled"?"Cancelled":"Expired"].map(csv).join(","));
  if (!data || data.length<500) break;
 }
 return new Response("\uFEFF"+rows.join("\r\n"),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="KLGCR-cards-to-block-${malaysiaDay()}.csv"`,"Cache-Control":"private, no-store"}});
}
