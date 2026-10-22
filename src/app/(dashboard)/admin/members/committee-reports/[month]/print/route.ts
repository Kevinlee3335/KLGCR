import {NextRequest} from "next/server";
import {requireRole} from "@/lib/auth";
import {createAdminClient} from "@/lib/supabase/admin";
import {membershipEnabled} from "@/lib/membership";
import {renderCommitteeReport,validCommitteeMonth,type CommitteeReport} from "@/lib/committee-report";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest,{params}:{params:Promise<{month:string}>}){
 await requireRole(["admin"]);
 if(!membershipEnabled()) return new Response("Not available",{status:404});
 const {month}=await params;
 if(!validCommitteeMonth(month+"-01")) return new Response("Invalid month",{status:400});
 const {data,error}=await createAdminClient().from("membership_committee_reports").select("*").eq("month",month+"-01").maybeSingle();
 if(error) return new Response("Unable to load report",{status:500});
 if(!data) return new Response("Report not found. Generate and save this month first.",{status:404});
 const download=request.nextUrl.searchParams.get("download")==="1";
 return new Response(renderCommitteeReport(data as CommitteeReport),{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",...(download?{"Content-Disposition":`attachment; filename="KLGCR-Sports-Committee-${month}.html"`}:{})}});
}
