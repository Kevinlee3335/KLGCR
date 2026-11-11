import {after, NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {getSessionProfile} from "@/lib/auth";
import {billingPreviewEnabled, malaysiaClock, monthSchema, type UtilityAccount} from "@/lib/billing-preview";
import {readMeterPhoto} from "@/lib/meter-ocr-server";
import {createAdminClient} from "@/lib/supabase/admin";
import {ensureUtilityMonth} from "@/lib/utility-months";
import {canCaptureUtilityPhotos, utilityMeterPhotoData, utilityPhotoData, type UtilityPhotoProgress} from "@/lib/utility-photo-access";

export const maxDuration = 60;
export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, {status, headers: {"Cache-Control": "private, no-store"}});
const meterIdentifier = z.string().min(1).max(100);
const inputSchema = z.object({
 period: monthSchema, revision: z.number().int().nonnegative(), accountId: meterIdentifier, meterId: meterIdentifier,
 photo: z.string().max(220000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
}).strict();
const readingQuerySchema = z.object({period: monthSchema, accountId: meterIdentifier, meterId: meterIdentifier, runId: z.string().uuid()});

type AdminClient = ReturnType<typeof createAdminClient>;
type PhotoInput = z.infer<typeof inputSchema>;
type SavedMeter = {status: "saved"; period: string; revision: number; runId: string; meter: UtilityAccount["meters"][number]};
type CaptureFailure = {status: "month_changed" | "meter_missing" | "stale_revision" | "meter_changed"};

async function listPhotos(db: AdminClient, accountId: string | null, meterId: string | null) {
 const {data, error} = await db.rpc("get_utility_meter_photos", {p_account_id: accountId, p_meter_id: meterId});
 if (error || !data) throw Error("Meter photos unavailable");
 const {period, revision, utilityAccounts} = data as {period: string; revision: number; utilityAccounts: UtilityAccount[]};
 return utilityPhotoData({utilityPeriod: period, utilityAccounts}, revision);
}

function readingMessage(status: UtilityPhotoProgress["status"], reading?: number | null, updatedMeter = false) {
 switch (status) {
  case "read": return `Photo and suggested reading ${reading} saved. Admin must check and confirm.`;
  case "manual": return "Photo saved. AI could not identify a reliable reading; Admin must check the photo and enter it manually.";
  case "unavailable": return "Photo saved. Automatic reading is unavailable; Admin can enter the reading or use Read photo again.";
  case "superseded": return updatedMeter ? "A newer meter update was kept and is shown here." : "Photo saved. A newer meter update was kept; reload readings to see it.";
  case "pending": return "Photo saved. AI is reading the meter.";
 }
}

async function finishReading(db: AdminClient, input: PhotoInput, saved: SavedMeter, userId: string, status: "read" | "manual" | "unavailable", reading: number | null) {
 const {data, error} = await db.rpc("finish_utility_meter_photo_reading", {
  p_period: input.period, p_account_id: input.accountId, p_meter_id: input.meterId, p_run_id: saved.runId,
  p_status: status, p_reading: reading, p_user_id: userId,
 });
 if (error || !data) throw Error("Unable to finish automatic utility meter reading");
 return data as UtilityPhotoProgress;
}

async function readAndSaveSuggestion(db: AdminClient, input: PhotoInput, saved: SavedMeter, userId: string, options?: {reservationRetries: number}) {
 const meter = saved.meter;
 const suggestion = await readMeterPhoto({
  photo: input.photo, unit: meter.unit, serial: meter.serial, meterId: meter.id, readingDigits: meter.readingDigits,
 }, userId, options).catch(() => null);
 const status = !suggestion ? "unavailable" : suggestion.reading === null || suggestion.confidence === "low" ? "manual" : "read";
 return finishReading(db, input, saved, userId, status, suggestion?.reading ?? null);
}

export async function GET(req: NextRequest) {
 if (!billingPreviewEnabled() || !canCaptureUtilityPhotos(await getSessionProfile())) return reply({error: "Access denied"}, 403);
 const query = req.nextUrl.searchParams;
 try {
  const db = createAdminClient();
  if (query.has("reading")) {
   const parsed = readingQuerySchema.safeParse({period: query.get("period"), accountId: query.get("account"), meterId: query.get("meter"), runId: query.get("reading")});
   if (!parsed.success) return reply({error: "Invalid meter reading query"}, 400);
   const {period, accountId, meterId, runId} = parsed.data;
   const {data, error} = await db.rpc("get_utility_meter_photo_reading", {
    p_period: period, p_account_id: accountId, p_meter_id: meterId, p_run_id: runId,
   });
   if (error || !data) throw Error("Meter reading unavailable");
   const result = data as Omit<UtilityPhotoProgress, "meter"> & {meter?: SavedMeter["meter"]};
   const meter = result.meter ? utilityMeterPhotoData(result.meter) : undefined;
   return reply({...result, meter, message: readingMessage(result.status, result.reading, !!meter)});
  }
  await ensureUtilityMonth();
  return reply(await listPhotos(db, query.get("account"), query.get("meter")));
 } catch {
  return reply({error: "Unable to load meter photos. Please reload."}, 503);
 }
}

export async function POST(req: NextRequest) {
 const profile = await getSessionProfile();
 if (!billingPreviewEnabled() || !profile || !canCaptureUtilityPhotos(profile)) return reply({error: "Access denied"}, 403);
 if (req.headers.get("origin") !== req.nextUrl.origin) return reply({error: "Invalid origin"}, 403);
 const raw = await req.text();
 if (Buffer.byteLength(raw) > 230000) return reply({error: "Photo too large"}, 413);
 let input: PhotoInput;
 try {
  input = inputSchema.parse(JSON.parse(raw));
 } catch {
  return reply({error: "Invalid photo input"}, 400);
 }

 try {
  await ensureUtilityMonth();
  const db = createAdminClient();
  const {data, error} = await db.rpc("save_utility_meter_photo", {
   p_period: input.period, p_revision: input.revision, p_account_id: input.accountId, p_meter_id: input.meterId,
   p_photo: input.photo, p_capture_date: malaysiaClock().date, p_user_id: profile.id,
  });
  if (error || !data) return reply({error: "Photo could not be saved. Please try again."}, 503);
  const capture = data as SavedMeter | CaptureFailure;
  switch (capture.status) {
   case "month_changed": return reply({error: "Billing month changed. Reload before taking a photo."}, 409);
   case "meter_missing": return reply({error: "Meter not found."}, 404);
   case "stale_revision": return reply({error: "Another user updated the readings. Reload and try again."}, 409);
   case "meter_changed": return reply({error: "This meter was updated by another user. Reload before replacing its photo."}, 409);
  }
  if (capture.status !== "saved") return reply({error: "Photo could not be saved. Please try again."}, 503);
  const saved = capture;

  // Older clients still expect the account list. Current clients update only this meter.
  async function captureResponse(result: UtilityPhotoProgress) {
   const message = readingMessage(result.status, result.reading);
   const pending = result.status === "pending";
   const flags = pending ? {readingPending: true, readingId: saved.runId} : {};
   if (req.headers.get("x-utility-photo-response") !== "meter") {
    const list = await listPhotos(db, input.accountId, null);
    return reply({...list, message, ...flags}, pending ? 202 : 200);
   }
   const meter = utilityMeterPhotoData(saved.meter);
   if (result.status === "read") meter.curr = result.reading ?? null;
   return reply({
    period: saved.period, revision: result.status === "superseded" ? saved.revision : result.revision ?? saved.revision,
    accountId: input.accountId, meter, message, ...flags,
   }, pending ? 202 : 200);
  }

  if (req.headers.get("prefer") === "respond-async") {
   try {
    after(async () => {
     try {
      await readAndSaveSuggestion(db, input, saved, profile.id, {reservationRetries: 2});
     } catch {
      console.error("Unable to finish automatic utility meter reading");
     }
    });
   } catch {
    return await captureResponse(await finishReading(db, input, saved, profile.id, "unavailable", null).catch(() => ({status: "unavailable"} as const)));
   }
   return await captureResponse({status: "pending"});
  }
  return await captureResponse(await readAndSaveSuggestion(db, input, saved, profile.id).catch(() => ({status: "unavailable"} as const)));
 } catch {
  return reply({error: "Unable to save photo. Please reload and try again."}, 503);
 }
}
