import {dispatchDocumentReviewPushes} from '@/lib/document-review-notifications';
import { BILLING_APPROVER_ID } from "@/lib/billing-approval";
import {
  loadBillingHistory, loadBillingMeterPhotos, loadBillingOverview, loadBillingPack, loadBillingPreviewData,
} from "@/lib/billing-preview-data";
import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { billingPreviewEnabled,configSchema,daySchema,makeSnapshot,malaysiaClock,monthSchema,scheduleDecision } from "@/lib/billing-preview";
import { z } from "zod";
export const dynamic="force-dynamic";
export const preferredRegion="sin1";
const photoTargetSchema=z.object({accountId:z.string().max(100),meterId:z.string().max(100),side:z.enum(["photo","previousPhoto"])});
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
async function auth(){if(!billingPreviewEnabled())return null;const profile=await getSessionProfile();return profile&&["admin","management_viewer"].includes(profile.role)?profile:null}
export async function GET(req: NextRequest) {
  try {
    const profile = await auth();
    if (!profile) return reply({ error: "Access denied" }, 403);
    const params = req.nextUrl.searchParams;
    const view = params.get("view");
    switch (view) {
      case null:
        return reply(await loadBillingPreviewData(params.get("photos") === "1"));
      case "overview":
        return reply(await loadBillingOverview(profile.role === "admin" && profile.id === BILLING_APPROVER_ID));
      case "history":
        return reply({ runs: await loadBillingHistory() });
      case "pack": {
        const id = params.get("id");
        const selector = id !== null
          ? { id: z.string().uuid().parse(id) }
          : { kind: z.enum(["rental", "utility"]).parse(params.get("kind")), period: monthSchema.parse(params.get("period")) };
        return reply({ pack: await loadBillingPack(selector) });
      }
      case "photos": {
        const account = params.has("account") ? z.string().min(1).max(100).parse(params.get("account")) : undefined;
        const photos = await loadBillingMeterPhotos(account);
        return photos ? reply(photos) : reply({ error: "Meter account not found" }, 404);
      }
      default:
        return reply({ error: "Unknown billing view" }, 400);
    }
  } catch (error) {
    if (error instanceof z.ZodError) return reply({ error: "Invalid billing request" }, 400);
    const message = error instanceof Error && ["Billing preview storage is unavailable", "Billing meter data needs repair. No records were changed."].includes(error.message)
      ? error.message : "Unable to load billing data. Please reload or contact the administrator.";
    return reply({ error: message }, message.includes("needs repair") ? 422 : 503);
  }
}
export async function POST(req:NextRequest){const profile=await auth();if(!profile)return reply({error:"Access denied"},403);if(req.headers.get("origin")!==req.nextUrl.origin)return reply({error:"Invalid origin"},403);const raw=await req.text();if(Buffer.byteLength(raw)>4000000)return reply({error:"Photo/configuration too large"},413);try{const j=JSON.parse(raw);const db=await createClient();if(j.action==="save" || j.action==="save_meter_photo") {
  let config=configSchema.parse(j.config);
  const revision=z.number().int().nonnegative().parse(j.revision);
  const target=j.action==="save_meter_photo"?photoTargetSchema.parse(j.target):undefined;
  if(target && !config.utilityAccounts.find(account=>account.id===target.accountId)?.meters.find(meter=>meter.id===target.meterId)?.[target.side]) {
    return reply({error:"The selected meter photo is missing."},400);
  }
  if(target || j.preservePhotos===true) {
    const stored=await db.from("billing_preview_settings").select("config").eq("id",1).single();
    if(stored.error)return reply({error:"Unable to preserve meter photos"},503);
    const original=configSchema.parse(stored.data.config);
    const priorAccounts=new Map(original.utilityAccounts.map(account=>[account.id,account]));
    config={...config,utilityAccounts:config.utilityAccounts.map(account=>({
      ...account,
      meters:account.meters.map(meter=>{
        const before=priorAccounts.get(account.id)?.meters.find(value=>value.id===meter.id);
        const restored={...meter,photo:before?.photo,previousPhoto:before?.previousPhoto};
        if(account.id===target?.accountId && meter.id===target.meterId)restored[target.side]=meter[target.side];
        return restored;
      }),
    }))};
  }
  const {data,error}=await db.from("billing_preview_settings").update({config,revision:revision+1,updated_by:profile.id,updated_at:new Date().toISOString()}).eq("id",1).eq("revision",revision).select("revision").maybeSingle();
  if(error)return reply({error:"Unable to save test settings"},500);
  if(!data)return reply({error:"Another user changed settings. Reload before saving."},409);
  return reply({ok:true,revision:data.revision});
}
if(j.action!=="simulate"&&j.action!=="generate"&&j.action!=="submit")return reply({error:"Unknown action"},400);
const {data,error}=await db.from("billing_preview_settings").select("config").eq("id",1).single();if(error)return reply({error:"Unable to read test settings"},503);const config=configSchema.parse(data.config);const clock=j.action!=="submit"&&j.date?{date:daySchema.parse(j.date),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).parse(j.time)}:malaysiaClock();const decision=scheduleDecision(config,clock);if(j.action==="simulate")return reply({...decision,date:clock.date,time:clock.time,testMode:true});const kind=z.enum(["rental","utility"]).parse(j.kind);const period=monthSchema.parse(j.period);if(kind==="rental"&&j.action!=="submit"&&(period!==decision.period||decision.status!=="ready"))return reply({error:`Schedule is ${decision.status}`,decision},409);if(kind==="utility"&&period!==config.utilityPeriod)return reply({error:"Utility month does not match the saved readings"},409);const snapshot=makeSnapshot(kind,period,clock.date,config,profile.full_name);const res=await db.from("billing_preview_runs").insert({kind,period,issue_date:clock.date,total:snapshot.total,snapshot,created_by:profile.id}).select("id").single();if(res.error?.code==='23505')return reply({error:'This month already has a saved invoice pack. Open Invoice history to review its status; saved packs are not overwritten.'},409);if(res.error)return reply({error:res.error.code==="23505"?"This month already has a saved test invoice pack. It cannot be generated twice.":"Unable to save test invoice pack"},res.error.code==="23505"?409:500);await dispatchDocumentReviewPushes(res.data.id).catch(error=>console.error('Document phone notification pending retry',error));return reply({ok:true,id:res.data.id,snapshot,reviewStatus:'Pending Fikri Verification',printStatus:kind==="utility"?"Manual printing only — no printer contacted":"Simulated only — no printer contacted"})
}catch(e){return reply({error:e instanceof z.ZodError?"Invalid billing input":e instanceof Error?e.message:"Request failed"},400)}}
