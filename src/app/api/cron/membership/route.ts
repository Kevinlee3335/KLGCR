import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { membershipEnabled, reminderDates } from "@/lib/membership";
import { deliverMembershipEmails } from "@/lib/membership-email";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
 const secret = process.env.CRON_SECRET;
 if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({error:"Unauthorized"},{status:401});
 if (!membershipEnabled()) return NextResponse.json({skipped:true});
 try {
  const db = createAdminClient();
  const dates = reminderDates();
  // Idempotent snapshots; catches up any closed months missed during an outage.
  const {data:reports,error:reportError}=await db.rpc("generate_due_membership_committee_reports");
  if(reportError) console.error("Committee report generation pending retry",reportError.code);
  // A terminated worker may leave a claimed email; recover after 15 minutes.
  const {error:resetError} = await db.from("membership_emails").update({status:"pending"}).eq("status","sending").lt("claimed_at",new Date(Date.now()-15*60*1000).toISOString());
  if (resetError) throw resetError;
  if (dates.reminderDue) {
   let offset = 0;
   for (;;) {
    const {data:members,error} = await db.from("memberships").select("id").eq("status","active").lt("expires_on",dates.nextMonth).order("id").range(offset,offset+499);
    if (error) throw error;
    if (!members?.length) break;
    const {error:queuedError} = await db.from("membership_emails").upsert(members.map(m=>({member_id:m.id,event_key:`reminder:${m.id}:${dates.nextMonth}`,kind:"reminder",period_start:dates.nextMonth})),{onConflict:"event_key",ignoreDuplicates:true});
    if (queuedError) throw queuedError;
    offset += members.length;
    if (members.length < 500) break;
   }
  }
  const sent = await deliverMembershipEmails();
  if(reportError) return NextResponse.json({error:"Committee report generation pending retry.",sent},{status:500});
  return NextResponse.json({ok:true,sent,reports,date:dates.day});
 } catch (error) { console.error("Membership cron failed",error); return NextResponse.json({error:"Membership reminders could not be completed."},{status:500}); }
}
