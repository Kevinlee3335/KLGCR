"use client";
import {useEffect, useRef, useState} from "react";
import {MeterPhotoControl} from "./meter-photo-control";
import {BillingMeterPhotos} from "./billing-meter-photos";
import type {UtilityMeterPhotoData, UtilityPhotoCapture, UtilityPhotoData, UtilityPhotoProgress} from "@/lib/utility-photo-access";

type PendingReading = {accountId: string; meterId: string; period: string; readingId: string; expiresAt: number};
const READING_POLL_MS = 8_000;
const READING_TIMEOUT_MS = 52_000;

async function request<Result>(query = "", options: RequestInit = {}): Promise<Result> {
 const response = await fetch("/api/utility-photos" + query, {cache: "no-store", ...options});
 const result = await response.json();
 if (!response.ok) throw Error(result.error || "Unable to load utilities");
 return result;
}

function meterKey(accountId: string, meterId: string) {
 return JSON.stringify([accountId, meterId]);
}

function patchMeter(state: UtilityPhotoData, accountId: string, meterId: string, patch: Partial<UtilityMeterPhotoData>): UtilityPhotoData {
 return {...state, accounts: state.accounts.map(account => account.id !== accountId ? account : {
  ...account, meters: account.meters.map(meter => meter.id !== meterId ? meter : {...meter, ...patch}),
 })};
}

async function compress(file:File){if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error("Choose a JPG, PNG or WebP photo.");const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext("2d");if(!ctx)throw Error("Camera image could not be processed");ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);for(const q of [.8,.65,.5,.35]){const data=canvas.toDataURL("image/jpeg",q);if(data.length<=220000)return data}throw Error("Photo is too large. Take a closer photo of the meter digits.")}finally{bitmap.close()}}
export function UtilityPhotoPanel(){const [opened,setOpened]=useState<string|null>(null);const [state,setState]=useState<UtilityPhotoData|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[search,setSearch]=useState("");
 const [pending, setPending] = useState<PendingReading[]>([]);
 const meterRevisions = useRef(new Map<string, number>());
 const baseRevision = state?.revision ?? 0;

 async function reload(account?: string) {
  setBusy(true);
  try {
   const query = account ? "?" + new URLSearchParams({account}) : "";
   const result = await request<UtilityPhotoData>(query);
   meterRevisions.current.clear();
   setOpened(account ?? null);
   setState(result);
   setMessage("");
  } catch (error) {
   setMessage(error instanceof Error ? error.message : "Unable to load utilities");
  } finally {
   setBusy(false);
  }
 }

 useEffect(() => {void reload()}, []);
 useEffect(() => {
  if (!opened || busy) return;
  const active = pending.filter(reading => reading.accountId === opened);
  if (!active.length) return;
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout>;

  async function check() {
   const results = await Promise.all(active.map(async reading => {
    const {period, accountId, meterId, readingId} = reading;
    const query = "?" + new URLSearchParams({reading: readingId, period, account: accountId, meter: meterId});
    const progress = await request<UtilityPhotoProgress>(query, {signal: abort.signal}).catch(() => null);
    return {reading, progress};
   }));
   if (abort.signal.aborted) return;

   const finished = results.filter(({reading, progress}) => (progress && progress.status !== "pending") || reading.expiresAt <= Date.now());
   if (!finished.length) {
    timer = setTimeout(() => void check(), READING_POLL_MS);
    return;
   }

   for (const {reading, progress} of finished) {
    if (progress?.revision == null) continue;
    const {period, accountId, meterId} = reading;
    const key = meterKey(accountId, meterId);
    const {revision, meter} = progress;
    const patch = meter ? {
     ...meter, readingDigits: meter.readingDigits, previousDate: meter.previousDate, currentDate: meter.currentDate,
     ...(progress.replacePhotos ? {photo: meter.photo, previousPhoto: meter.previousPhoto} : {}),
    } : progress.status === "read" && progress.reading != null ? {curr: progress.reading, confirmed: false} : null;
    const visibleRevision = meterRevisions.current.get(key) ?? baseRevision;
    if (!patch || revision < visibleRevision) continue;
    meterRevisions.current.set(key, revision);
    setState(current => current?.period === period && current.revision <= revision
     ? patchMeter(current, accountId, meterId, patch) : current);
   }
   const terminal = finished.find(({progress}) => progress && progress.status !== "pending");
   setMessage(terminal?.progress?.message ?? "Photo saved. Admin can check the reading or use Read photo again.");
   const finishedIds = new Set(finished.map(({reading}) => reading.readingId));
   setPending(current => current.filter(reading => !finishedIds.has(reading.readingId)));
  }

  timer = setTimeout(() => void check(), READING_POLL_MS);
  return () => {
   clearTimeout(timer);
   abort.abort();
  };
 }, [baseRevision, busy, opened, pending]);

 async function save(file: File, accountId: string, meterId: string) {
  if (!state || busy) return;
  setBusy(true);
  setMessage("Saving photo…");
  try {
   const photo = await compress(file);
   const key = meterKey(accountId, meterId);
   const saved = await request<UtilityPhotoCapture>("", {
    method: "POST",
    headers: {"Content-Type": "application/json", Prefer: "respond-async", "X-Utility-Photo-Response": "meter"},
    body: JSON.stringify({period: state.period, revision: meterRevisions.current.get(key) ?? state.revision, accountId, meterId, photo}),
   });
   const {meter, period, readingId} = saved;
   meterRevisions.current.set(key, saved.revision);
   setState(current => current?.period === period ? patchMeter(current, accountId, meterId, {...meter, photo}) : current);
   setPending(current => {
    const rest = current.filter(reading => reading.accountId !== accountId || reading.meterId !== meterId);
    return saved.readingPending && readingId ? [...rest, {accountId, meterId, period, readingId, expiresAt: Date.now() + READING_TIMEOUT_MS}] : rest;
   });
   setMessage(saved.message);
  } catch (error) {
   setMessage(error instanceof Error ? error.message : "Unable to save photo");
  } finally {
   setBusy(false);
  }
 }

 return <div className="billing-module">
  <div className="billing-toolbar"><strong>Billing month: {state?.period||(message?"Unavailable":"Loading…")}</strong><button type="button" disabled={busy} onClick={()=>void reload(opened??undefined)}>Reload readings</button><label>Search account or meter<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, meter or serial number"/></label></div>
  {message&&<p className="billing-message" role="status">{message}</p>}
  {state?.accounts.filter(a=>(a.name+" "+a.meters.map(m=>m.label+" "+m.serial).join(" ")).toLowerCase().includes(search.toLowerCase())).map(a=><article className="billing-card" key={a.id}>
    <div className="billing-account-heading"><h3>{a.name}</h3><button type="button" aria-expanded={opened===a.id} disabled={busy} onClick={()=>opened===a.id?setOpened(null):void reload(a.id)}>{opened===a.id?"Close readings":"Open readings"}</button></div>
    {opened===a.id&&<div className="billing-meters">{a.meters.map(m=><div className="billing-meter" key={m.id}>
      <b>{m.label} · {m.unit}</b><small>{m.serial||"Serial number not provided"} · {m.role}</small>
      <div className="billing-fields">{[
        ["Read first digits",m.readingDigits?`First ${m.readingDigits} digits`:"Auto · whole digits"],
        ["Previous",m.prev],["Current (whole digits only)",m.curr],
        ["Previous reading date",m.previousDate],["Current reading date",m.currentDate]
      ].map(([label,value])=><label key={label}>{label}<input readOnly value={value??""} placeholder="Pending"/></label>)}</div>
      <label><input type="checkbox" checked={m.confirmed} disabled/> Reading checked against photo</label>
      <MeterPhotoControl hint="The photo saves first and AI reads it in the background. Admin checks and confirms the suggested reading." label={a.name+" · "+m.label} busy={busy} onPhoto={file=>void save(file,a.id,m.id)}/>
      {pending.some(reading => reading.accountId === a.id && reading.meterId === m.id) && <small>AI reading in progress</small>}
      <BillingMeterPhotos label={a.name+" · "+m.label} previousPhoto={m.previousPhoto} photo={m.photo} previousDate={m.previousDate||"Previous month"} currentDate={m.currentDate||state.period+"-01"} previous={m.prev} current={m.curr}/>
    </div>)}</div>}
  </article>)}
  {state&&!state.accounts.length&&<p>No utility meters are available for this month.</p>}
 </div>
}
