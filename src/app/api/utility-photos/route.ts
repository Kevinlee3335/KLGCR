import {ensureUtilityMonth} from "@/lib/utility-months";
import {after,NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getSessionProfile} from "@/lib/auth";
import {createAdminClient} from "@/lib/supabase/admin";
import {billingPreviewEnabled,configSchema,malaysiaClock,monthSchema,type BillingConfig,type UtilityAccount} from "@/lib/billing-preview";
import {canCaptureUtilityPhotos,replaceUtilityPhoto,utilityPhotoData} from "@/lib/utility-photo-access";
import {readMeterPhoto} from "@/lib/meter-ocr-server";
export const maxDuration=60;
export const preferredRegion="sin1";
export const dynamic="force-dynamic";
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const inputSchema=z.object({period:monthSchema,revision:z.number().int().nonnegative(),accountId:z.string().min(1).max(100),meterId:z.string().min(1).max(100),photo:z.string().max(220000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)}).strict();
async function settings(){await ensureUtilityMonth();const db=createAdminClient();const {data,error}=await db.from("billing_preview_settings").select("config,revision").eq("id",1).single();if(error||!data)throw Error("Storage unavailable");return {db,config:configSchema.parse(data.config),revision:data.revision as number}}
function meterResponse(config: BillingConfig, revision: number, accountId: string | null, meterId: string | null, message?: string, readingPending = false) {
 const result=utilityPhotoData(config,revision);
 for(const account of result.accounts) for(const meter of account.meters) {
  if(account.id!==accountId||(meterId!==null&&meter.id!==meterId)){meter.photo=undefined;meter.previousPhoto=undefined}
 }
 return reply({...result,...(message?{message}:{}),...(readingPending ? {readingPending} : {})}, readingPending ? 202 : 200);
}
type PhotoInput = z.infer<typeof inputSchema>;

function findMeter(config: BillingConfig, {accountId, meterId}: PhotoInput) {
 return config.utilityAccounts.find(account => account.id === accountId)?.meters.find(meter => meter.id === meterId);
}

async function readAndSaveSuggestion(input: PhotoInput, savedMeter: UtilityAccount["meters"][number], userId: string, options?: {reservationRetries: number}) {
 let suggestion;
 try {
  suggestion = await readMeterPhoto({
   photo: input.photo, unit: savedMeter.unit, serial: savedMeter.serial,
   meterId: savedMeter.id, readingDigits: savedMeter.readingDigits,
  }, userId, options);
 } catch {
  const latest = await settings();
  return {...latest, message: "Photo saved. Automatic reading is unavailable; Admin can enter the reading or use Read photo again."};
 }
 for (let retry = 0; retry < 3; retry++) {
  const latest = await settings();
  // Keep manual corrections, retakes, digit settings and rollovers made while AI was working.
  if (latest.config.utilityPeriod !== input.period || JSON.stringify(findMeter(latest.config, input)) !== JSON.stringify(savedMeter)) {
   return {...latest, message: "Photo saved. A newer meter update was kept; the AI result was not applied."};
  }
  if (suggestion.reading === null || suggestion.confidence === "low" || (savedMeter.prev !== null && suggestion.reading < savedMeter.prev)) {
   return {...latest, message: "Photo saved. AI could not identify a reliable reading; Admin must check the photo and enter it manually."};
  }
  const config = {...latest.config, utilityAccounts: latest.config.utilityAccounts.map(account => account.id !== input.accountId ? account : {
   ...account, meters: account.meters.map(meter => meter.id !== input.meterId ? meter : {...meter, curr: suggestion.reading, confirmed: false}),
  })};
  const {data, error} = await latest.db.from("billing_preview_settings").update({
   config, revision: latest.revision + 1, updated_by: userId, updated_at: new Date().toISOString(),
  }).eq("id", 1).eq("revision", latest.revision).select("revision").maybeSingle();
  if (error) break;
  if (data) return {
   config, revision: data.revision as number,
   message: `Photo and suggested reading ${suggestion.reading} saved. Confidence: ${suggestion.confidence}. Admin must check and confirm. ${suggestion.note}`,
  };
 }
 const latest = await settings();
 return {...latest, message: "Photo saved. Readings changed during AI processing; Admin can use Read photo again."};
}

export async function GET(req:NextRequest){if(!billingPreviewEnabled()||!canCaptureUtilityPhotos(await getSessionProfile()))return reply({error:"Access denied"},403);try{const s=await settings();return meterResponse(s.config,s.revision,req.nextUrl.searchParams.get("account"),req.nextUrl.searchParams.get("meter"))}catch{return reply({error:"Unable to load meter photos. Please reload."},503)}}
export async function POST(req:NextRequest){
 const profile=await getSessionProfile();if(!billingPreviewEnabled()||!profile||!canCaptureUtilityPhotos(profile))return reply({error:"Access denied"},403);
 if(req.headers.get("origin")!==req.nextUrl.origin)return reply({error:"Invalid origin"},403);
 const raw=await req.text();if(Buffer.byteLength(raw)>230000)return reply({error:"Photo too large"},413);
 try{
 const input=inputSchema.parse(JSON.parse(raw));
 let baseline:ReturnType<typeof configSchema.parse>|undefined;
 const meter=(config:BillingConfig)=>findMeter(config,input);
 for(let attempt=0;attempt<3;attempt++){
  const s=await settings();
  if(s.config.utilityPeriod!==input.period)return reply({error:"Billing month changed. Reload before taking a photo."},409);
  if(!baseline){
   if(input.revision===s.revision)baseline=s.config;
   else {
    const history=await s.db.from("utility_reading_revisions").select("config").eq("revision",input.revision).single();
    const previous=configSchema.safeParse(history.data?.config);
    if(history.error||!previous.success||previous.data.utilityPeriod!==input.period)return reply({error:"Another user updated the readings. Reload and try again."},409);
    baseline=previous.data;
   }
  }
  // Merge an upload only if this exact account/meter is unchanged. Keep every
  // unrelated Admin edit, and still reject a competing edit to this meter.
  if(!meter(baseline)||JSON.stringify(meter(baseline))!==JSON.stringify(meter(s.config)))return reply({error:"This meter was updated by another user. Reload before replacing its photo."},409);
  const config=configSchema.parse(replaceUtilityPhoto(s.config,input,malaysiaClock().date));
  const {data,error}=await s.db.from("billing_preview_settings").update({config,revision:s.revision+1,updated_by:profile.id,updated_at:new Date().toISOString()}).eq("id",1).eq("revision",s.revision).select("revision").maybeSingle();
  if(error)return reply({error:"Photo could not be saved. Please try again."},503);
  if(data){
   const savedMeter = structuredClone(meter(config));
   if (!savedMeter) throw Error("Meter not found.");
   if (req.headers.get("prefer") === "respond-async") {
    try {
     after(async () => {
      try {
       await readAndSaveSuggestion(input, savedMeter, profile.id, {reservationRetries: 2});
      } catch {
       console.error("Unable to finish automatic utility meter reading");
      }
     });
    } catch {
     return meterResponse(config, data.revision, input.accountId, null,
      "Photo saved. Automatic reading could not start. Admin can use Read photo again.");
    }
    return meterResponse(config, data.revision, input.accountId, null, "Photo saved. AI is reading the meter.", true);
   }
   const reading = await readAndSaveSuggestion(input, savedMeter, profile.id);
   return meterResponse(reading.config, reading.revision, input.accountId, null, reading.message);
  }
 }
 return reply({error:"Readings are being updated. Reload and try again."},409);
 }catch(e){return reply({error:e instanceof z.ZodError?"Invalid photo input":e instanceof Error&&/month changed|Meter not found/.test(e.message)?e.message:"Unable to save photo. Please reload and try again."},400)}
}
