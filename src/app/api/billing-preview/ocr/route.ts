import {readMeterPhoto,MeterOcrError} from "@/lib/meter-ocr-server";
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getSessionProfile} from "@/lib/auth";
import {billingPreviewEnabled} from "@/lib/billing-preview";
export const maxDuration=60;
const reply=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(req:NextRequest){
 if(!billingPreviewEnabled())return reply({error:"Test module only"},404);
 const profile=await getSessionProfile();
 if(!profile||!["admin","management_viewer"].includes(profile.role))return reply({error:"Access denied"},403);
 if(req.headers.get('origin')!==req.nextUrl.origin)return reply({error:"Invalid origin"},403);
 try{
 const raw=await req.text();if(Buffer.byteLength(raw)>230000)return reply({error:"Photo too large"},413);
 const input=z.object({photo:z.string().max(220000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),unit:z.enum(["kWh","m³"]),serial:z.string().max(100),readingDigits:z.number().int().min(1).max(10).nullable().optional(),meterId:z.string().max(100).optional()}).parse(JSON.parse(raw));
 return reply(await readMeterPhoto(input,profile.id));
 }catch(e){return reply({error:e instanceof MeterOcrError?e.message:"Photo reading failed. Enter the reading manually."},e instanceof MeterOcrError?e.status:502)}
}
