import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getSessionProfile} from "@/lib/auth";
import {createAdminClient} from "@/lib/supabase/admin";
import {billingPreviewEnabled,configSchema,malaysiaClock,monthSchema} from "@/lib/billing-preview";
import {canCaptureUtilityPhotos,replaceUtilityPhoto,utilityPhotoData} from "@/lib/utility-photo-access";
export const dynamic="force-dynamic";
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const inputSchema=z.object({period:monthSchema,revision:z.number().int().nonnegative(),accountId:z.string().min(1).max(100),meterId:z.string().min(1).max(100),photo:z.string().max(220000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)}).strict();
async function settings(){const db=createAdminClient();const {data,error}=await db.from("billing_preview_settings").select("config,revision").eq("id",1).single();if(error||!data)throw Error("Storage unavailable");return {db,config:configSchema.parse(data.config),revision:data.revision as number}}
export async function GET(){if(!billingPreviewEnabled()||!canCaptureUtilityPhotos(await getSessionProfile()))return reply({error:"Access denied"},403);try{const s=await settings();return reply(utilityPhotoData(s.config,s.revision))}catch{return reply({error:"Unable to load meter photos. Please reload."},503)}}
export async function POST(req:NextRequest){
 const profile=await getSessionProfile();if(!billingPreviewEnabled()||!canCaptureUtilityPhotos(profile))return reply({error:"Access denied"},403);
 if(req.headers.get("origin")!==req.nextUrl.origin)return reply({error:"Invalid origin"},403);
 const raw=await req.text();if(Buffer.byteLength(raw)>230000)return reply({error:"Photo too large"},413);
 try{const input=inputSchema.parse(JSON.parse(raw));const s=await settings();if(input.revision!==s.revision)return reply({error:"Another user updated the readings. Reload and try again."},409);
 const config=configSchema.parse(replaceUtilityPhoto(s.config,input,malaysiaClock().date));
 const {data,error}=await s.db.from("billing_preview_settings").update({config,revision:s.revision+1,updated_by:profile!.id,updated_at:new Date().toISOString()}).eq("id",1).eq("revision",s.revision).select("revision").maybeSingle();
 if(error)return reply({error:"Photo could not be saved. Please try again."},503);if(!data)return reply({error:"Another user updated the readings. Reload and try again."},409);
 return reply(utilityPhotoData(config,data.revision));
 }catch(e){return reply({error:e instanceof z.ZodError?"Invalid photo input":e instanceof Error&&/month changed|Meter not found/.test(e.message)?e.message:"Unable to save photo. Please reload and try again."},400)}
}
