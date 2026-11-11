"use client";
import {useEffect,useState} from "react";
import {MeterPhotoControl} from "./meter-photo-control";
import {BillingMeterPhotos} from "./billing-meter-photos";
import type {UtilityPhotoData} from "@/lib/utility-photo-access";
type PhotoResponse = UtilityPhotoData & {message?: string; readingPending?: boolean};
type PendingReading = {accountId: string; meterId: string; period: string; expiresAt: number};
const READING_POLL_MS = 8_000;
const READING_TIMEOUT_MS = 52_000;

async function request(body?: unknown, query = "", signal?: AbortSignal): Promise<PhotoResponse> {
 const response = await fetch("/api/utility-photos" + query, body ? {
  method: "POST", headers: {"Content-Type": "application/json", Prefer: "respond-async"}, body: JSON.stringify(body),
 } : {cache: "no-store", signal});
 const result = await response.json();
 if (!response.ok) throw Error(result.error || "Unable to load utilities");
 return result;
}

function accountQuery(accountId: string) {
 return "?" + new URLSearchParams({account: accountId});
}

function findMeter(data: UtilityPhotoData, reading: PendingReading) {
 return data.accounts.find(account => account.id === reading.accountId)?.meters.find(meter => meter.id === reading.meterId);
}

async function compress(file:File){if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error("Choose a JPG, PNG or WebP photo.");const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext("2d");if(!ctx)throw Error("Camera image could not be processed");ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);for(const q of [.8,.65,.5,.35]){const data=canvas.toDataURL("image/jpeg",q);if(data.length<=220000)return data}throw Error("Photo is too large. Take a closer photo of the meter digits.")}finally{bitmap.close()}}
export function UtilityPhotoPanel(){const [opened,setOpened]=useState<string|null>(null);const [state,setState]=useState<UtilityPhotoData|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[search,setSearch]=useState("");
 const [pending, setPending] = useState<PendingReading[]>([]);
 async function reload(account?:string){setBusy(true);try{const result=await request(undefined,account?accountQuery(account):"");setOpened(account??null);setState(result);setMessage("")}catch(e){setMessage(e instanceof Error?e.message:"Unable to load utilities")}finally{setBusy(false)}}
 useEffect(()=>{void reload()},[]);
 useEffect(() => {
  if (!opened || busy) return;
  const accountId = opened;
  const active = pending.filter(reading => reading.accountId === accountId);
  if (active.length === 0) return;
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout>;

  async function check() {
   const expired = active.filter(reading => reading.expiresAt <= Date.now());
   try {
    // Metadata only until a reading arrives, so a polling request never
    // downloads the account's meter photos.
    const summary = await request(undefined, "", abort.signal);
    const ready = active.filter(reading => summary.period === reading.period && findMeter(summary, reading)?.curr != null);
    const completed = active.filter(reading => summary.period !== reading.period || !findMeter(summary, reading));
    if (ready.length || completed.length) {
     const refreshed = await request(undefined, accountQuery(accountId), abort.signal);
     if (abort.signal.aborted) return;
     setState(previous => previous && previous.revision > refreshed.revision ? previous : refreshed);
     if (ready.length) setMessage("Meter readings updated. Admin must check and confirm.");
    }
    if (abort.signal.aborted) return;
    const finished = new Set([...ready, ...completed, ...expired]);
    if (finished.size > 0) {
     setPending(current => current.filter(reading => !finished.has(reading)));
     if (!ready.length && expired.length) setMessage("Photo saved. Admin can check the reading or use Read photo again.");
     return;
    }
   } catch {
    if (abort.signal.aborted) return;
    if (expired.length) {
     setPending(current => current.filter(reading => !expired.includes(reading)));
     setMessage("Photo saved. Reload to check for the automatic reading.");
     return;
    }
   }
   timer = setTimeout(() => void check(), READING_POLL_MS);
  }

  timer = setTimeout(() => void check(), READING_POLL_MS);
  return () => {
   clearTimeout(timer);
   abort.abort();
  };
 }, [busy, opened, pending]);

 async function save(file: File, accountId: string, meterId: string) {
  if (!state || busy) return;
  setBusy(true);
  setMessage("Saving photo…");
  try {
   const photo = await compress(file);
   const saved = await request({period: state.period, revision: state.revision, accountId, meterId, photo});
   setState(saved);
   const pendingReading = saved.readingPending ? [{accountId, meterId, period: saved.period, expiresAt: Date.now() + READING_TIMEOUT_MS}] : [];
   setPending(current => [
    ...current.filter(reading => reading.accountId !== accountId || reading.meterId !== meterId),
    ...pendingReading,
   ]);
   setMessage(saved.message || "Photo saved. Admin can now review the reading.");
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
