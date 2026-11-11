"use client";
import {documentReviewStatus} from "@/lib/document-review-status";
import {BillingPayments} from "./billing-payments";
import {BillingMailPanel} from "./billing-mail-panel";
import type {BillingMeterPhotosData, BillingOverview, BillingPack, BillingRunSummary} from "@/lib/billing-preview-types";
import {SignaturePad} from "./signature-pad";
import { orderedUtilityAccounts } from "@/lib/billing-account-order";
import { BillingMeterPhotos } from "./billing-meter-photos";
import { applyNewMeterPhoto, stripBillingMeterPhotos, type BillingMeterPhotoTarget } from "@/lib/billing-meter-photo";
import { BillingRegistry } from "./billing-registry";
import { MeterPhotoControl } from "./meter-photo-control";
import { useEffect,useState,useRef } from "react";
import { CalendarClock, FileText, Printer, Save, ShieldCheck } from "lucide-react";
import type { BillingConfig,BillingSnapshot } from "@/lib/billing-preview";
import { makeSnapshot,nextBillingDay,utilityLine,utilityAccountEligible } from "@/lib/billing-preview";
type State = Omit<BillingOverview, "photosLoaded"> & {photosLoaded?: boolean};

async function api(body?: unknown, query?: Record<string, string>, signal?: AbortSignal) {
 const suffix = query ? "?" + new URLSearchParams(query) : "";
 const response = await fetch("/api/billing-preview" + suffix, body
  ? {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}
  : {cache:"no-store",signal});
 const raw = await response.text();
 let result;
 try {
  result = JSON.parse(raw);
 } catch {
  throw Error("Billing server returned an empty or invalid response (HTTP " + response.status + "). Please reload.");
 }
 if (!response.ok) throw Error(result.error || "Unable to load billing");
 return result;
}

function mergeMeterPhotos(config: BillingConfig, accounts: BillingMeterPhotosData["accounts"]): BillingConfig {
 const byAccount = new Map(accounts.map(account => [account.id, new Map(account.meters.map(meter => [meter.id, meter]))]));
 return {
  ...config,
  utilityAccounts: config.utilityAccounts.map(account => {
   const photos = byAccount.get(account.id);
   if (!photos) return account;
   return {...account, meters: account.meters.map(meter => {
    const images = photos.get(meter.id);
    return images ? {...meter, photo:images.photo, previousPhoto:images.previousPhoto} : meter;
   })};
  }),
 };
}

function checkPhotoRevision(state: State, photos: BillingMeterPhotosData) {
 if (state.revision !== photos.revision || state.config.utilityPeriod !== photos.period) {
  throw Error("Billing readings changed. Reload before opening or replacing meter photos.");
 }
}

function saveBillingMetadata(config: BillingConfig, revision: number) {
 return api({action:"save",config:stripBillingMeterPhotos(config),preservePhotos:true,revision});
}
const money=(n:number)=>n.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
async function printPack(snapshot:BillingSnapshot){const w=window.open('','_blank');if(!w)throw Error('Allow this browser to open the invoice preview');try{const {buildBillingPrintHtml}=await import('@/lib/billing-print-template');w.document.write(buildBillingPrintHtml(snapshot,location.origin+'/billing/logo.jpg'));w.document.close()}catch(e){w.close();throw e}}
export function BillingPanel({createdBy="Preview",initialData,approver=false,canManageMail=false}:{createdBy?:string;initialData?:State;approver?:boolean;canManageMail?:boolean}){const [state,setState]=useState<State|null>(initialData??null),[tab,setTab]=useState('rental'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[date,setDate]=useState(initialData?.clock.date??''),[time,setTime]=useState('09:00'),[preview,setPreview]=useState<BillingSnapshot|null>(null),[month,setMonth]=useState('2026-11');
const [openAccount, setOpenAccount] = useState<string | null>(null);
const [loadedAccounts, setLoadedAccounts] = useState<string[]>([]);
const [photoError, setPhotoError] = useState("");
const [retryPhotos, setRetryPhotos] = useState(0);
const [history, setHistory] = useState<BillingRunSummary[] | null>(null);
const [historyError, setHistoryError] = useState("");
const [refreshHistory, setRefreshHistory] = useState(0);
const [previewRun, setPreviewRun] = useState<BillingRunSummary | null>(null);
const [previewHtml, setPreviewHtml] = useState("");
const previewBox = useRef<HTMLDivElement>(null);
const activeAccount = openAccount ?? (state
 ? orderedUtilityAccounts(state.config.utilityAccounts).find(account => utilityAccountEligible(account, state.config.utilityPeriod))?.id
 : undefined);
const photosReady = state?.photosLoaded !== false || Boolean(activeAccount && loadedAccounts.includes(activeAccount));

useEffect(() => {
 if (tab !== "history") return;
 const request = new AbortController();
 setHistoryError("");
 void api(undefined, {view:"history"}, request.signal).then((result: {runs: BillingRunSummary[]}) => {
  if (!request.signal.aborted) setHistory(result.runs);
 }).catch((error: unknown) => {
  if (!request.signal.aborted) setHistoryError(error instanceof Error ? error.message : "Unable to load invoice history.");
 });
 return () => request.abort();
}, [tab, refreshHistory]);

useEffect(() => {
 let request: AbortController | undefined;
 function openInvoice() {
  request?.abort();
  const hash = window.location.hash;
  if (!hash.startsWith("#invoice-")) return;
  const current = new AbortController();
  request = current;
  setTab("history");
  setMessage("Loading invoice pack…");
  void api(undefined, {view:"pack",id:hash.slice("#invoice-".length)}, current.signal).then((result: {pack: BillingPack | null}) => {
   if (current.signal.aborted) return;
   if (!result.pack) throw Error("Invoice pack was not found.");
   setPreviewRun(result.pack);
   setPreview(result.pack.snapshot);
   setMessage("");
  }).catch((error: unknown) => {
   if (!current.signal.aborted) setMessage(error instanceof Error ? error.message : "Unable to open invoice pack.");
  });
 }
 openInvoice();
 window.addEventListener("hashchange", openInvoice);
 return () => {
  request?.abort();
  window.removeEventListener("hashchange", openInvoice);
 };
}, []);

const revision = state?.revision;
const period = state?.config.utilityPeriod;
useEffect(() => {
 if (tab !== "utility" || !activeAccount || photosReady || busy) return;
 const request = new AbortController();
 setPhotoError("");
 void api(undefined, {view:"photos",account:activeAccount}, request.signal).then((photos: BillingMeterPhotosData) => {
  if (request.signal.aborted) return;
  if (photos.revision !== revision || photos.period !== period) throw Error("Billing readings changed. Reload to view the latest meter photos.");
  setState(previous => previous && previous.revision === revision
   ? {...previous, config:mergeMeterPhotos(previous.config, photos.accounts)}
   : previous);
  setLoadedAccounts(accounts => [...accounts, activeAccount]);
 }).catch((error: unknown) => {
  if (!request.signal.aborted) setPhotoError(error instanceof Error ? error.message : "Unable to load meter photos.");
 });
 return () => request.abort();
}, [activeAccount, busy, period, photosReady, retryPhotos, revision, tab]);

useEffect(()=>{let active=true;setPreviewHtml("");if(preview)void import("@/lib/billing-print-template").then(({buildBillingPrintHtml})=>{if(active)setPreviewHtml(buildBillingPrintHtml(preview,"/billing/logo.jpg").replace(/<div class="toolbar">[\s\S]*?<\/div>/,""))}).catch(()=>{if(active)setMessage("Unable to load invoice template. Please reopen the preview.")});return()=>{active=false}},[preview]);
useEffect(()=>{if(!preview)return;const before=document.body.style.overflow;document.body.style.overflow='hidden';const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setPreview(null)};window.addEventListener('keydown',close);return()=>{document.body.style.overflow=before;window.removeEventListener('keydown',close)}},[preview]);

async function load() {
 const overview: State = await api(undefined, {view:"overview"});
 setLoadedAccounts([]);
 setState(overview);
 setDate(previous => previous || overview.clock.date);
}
useEffect(() => {
 if (!initialData) void load().catch(error => setMessage(error.message));
}, [initialData]);

async function task(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn()}catch(e){setMessage(e instanceof Error?e.message:'Request failed')}finally{setBusy(false)}}
if(!state)return <div className="card" role="status">{message||'Loading billing…'}</div>;
const config=state.config;
const change=(patch:Partial<BillingConfig>)=>setState(previous=>previous && {...previous,config:{...previous.config,...patch}});
const save=async()=>{const r=await saveBillingMetadata(config,state.revision);setState(previous=>previous && {...previous,revision:r.revision});setMessage('Billing settings saved to the system.')};
async function readPhoto(next:State,accountId:string,id:string,side:"current"|"previous"="current"){
const meter=next.config.utilityAccounts.find(a=>a.id===accountId)?.meters.find(m=>m.id===id);
const image=side==='previous'?meter?.previousPhoto:meter?.photo;if(!image||!meter)throw Error('Take or upload a photo first');
setMessage('Photo saved in the app. Reading the meter…');
const res=await fetch('/api/billing-preview/ocr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({photo:image,unit:meter.unit,serial:meter.serial,meterId:meter.id,readingDigits:meter.readingDigits??null})});
const j=await res.json();
if(!res.ok)throw Error(`Photo is saved. ${j.error||'AI reading failed; enter the reading manually.'}`);
const updated={...next.config,utilityAccounts:next.config.utilityAccounts.map(a=>({...a,meters:a.meters.map(m=>a.id===accountId&&m.id===id?{...m,[side==="previous"?"prev":"curr"]:j.reading,confirmed:false}:m)}))};
const saved=await saveBillingMetadata(updated,next.revision);
setState({...next,config:updated,revision:saved.revision});
setMessage(j.reading===null?'Photo saved. AI could not identify a clear number; enter the reading manually.':`Photo and suggested reading ${j.reading} saved for ${side==='previous'?'Previous':'Current'}. Confidence: ${j.confidence}. Check the photo, then confirm.${j.note?' '+j.note:''}`);
}
async function photo(file:File,accountId:string,id:string,mode:"new"|"current"|"previous"="new"){
const currentState=state;if(!currentState)throw Error("Billing is not loaded");
if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('Choose a JPG, PNG or WebP photo');
const bitmap=await createImageBitmap(file);const scale=Math.min(1,900/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();let quality=.65;let data=canvas.toDataURL('image/jpeg',quality);while(data.length>64000&&quality>.25){quality-=.1;data=canvas.toDataURL('image/jpeg',quality)}if(data.length>64000)throw Error('Photo is too large. Take a closer photo of the meter digits.');
setMessage('Saving meter photo…');
const updated={...config,utilityAccounts:config.utilityAccounts.map(a=>({...a,meters:a.meters.map(m=>a.id===accountId&&m.id===id?(mode==="previous"?{...m,previousPhoto:data,confirmed:false}:mode==="current"?{...m,photo:data,curr:null,confirmed:false}:applyNewMeterPhoto({...m,currentDate:m.currentDate||config.utilityPeriod+"-01"},data,state.clock.date)):m)}))};
const target:BillingMeterPhotoTarget={accountId,meterId:id,side:mode==="previous"?"previousPhoto":"photo"};
const saved=await api({action:"save_meter_photo",config:stripBillingMeterPhotos(updated,target),target,revision:currentState.revision});
const next={...currentState,config:updated,revision:saved.revision};setState(next);
await readPhoto(next,accountId,id,mode==="previous"?"previous":"current");
}
async function submitPack(kind:'rental'|'utility',period:string){
 await save();
 const r=await api({action:'submit',kind,period});
 await load();
 setPreview(null);
 setTab("history");
 setRefreshHistory(previous=>previous+1);
 setMessage('Submitted · Pending Fikri Verification. Fikri → Kevin → James.'+(r.notificationPending?' Reviewer notification is pending retry.':''));
}

async function sendMail(id: string) {
 const response = await fetch(`/api/billing-preview/${id}/email`, {method:"POST"});
 const result = await response.json();
 if (!response.ok) throw Error(result.error);
 setRefreshHistory(previous=>previous+1);
 setMessage(result.status === "sent" ? "Invoice email sent to Accounts with both CC recipients." : `Email: ${result.status}. ${result.error || "Delivery is being processed."}`);
}

function showPreview(snapshot: BillingSnapshot, run: BillingRunSummary | null = null) {
 setPreviewRun(run);
 setPreview(snapshot);
}

async function openPack(id: string) {
 const {pack}: {pack:BillingPack | null} = await api(undefined,{view:"pack",id});
 if (!pack) throw Error("Invoice pack was not found.");
 showPreview(pack.snapshot, pack);
}

async function view(kind: "rental" | "utility", accountId?: string) {
 const current = state;
 if (!current) return;
 const billingPeriod = kind === "rental" ? month : config.utilityPeriod;
 const {pack}: {pack:BillingPack | null} = await api(undefined,{view:"pack",kind,period:billingPeriod});
 if (pack) {
  if (!accountId) {
   showPreview(pack.snapshot,pack);
   return;
  }
  const line = pack.snapshot.lines.find(item=>item.accountId===accountId);
  if (line) {
   showPreview({...pack.snapshot,lines:[line],total:line.amount},pack);
   return;
  }
 }

 let draftConfig = config;
 if (kind === "utility" && current.photosLoaded === false && (!accountId || !loadedAccounts.includes(accountId))) {
  const query: Record<string, string> = {view:"photos"};
  if (accountId) query.account = accountId;
  const photos: BillingMeterPhotosData = await api(undefined, query);
  checkPhotoRevision(current, photos);
  draftConfig = mergeMeterPhotos(config,photos.accounts);
 }
 if (accountId) {
  const account = draftConfig.utilityAccounts.find(item=>item.id===accountId);
  if (!account) throw Error("Utility account was not found.");
  const line = utilityLine(account,billingPeriod);
  showPreview({kind,period:billingPeriod,issueDate:date,total:line.amount,lines:[line],testMode:true,createdBy});
 } else showPreview(makeSnapshot(kind,billingPeriod,date,draftConfig,createdBy));
}
return <div className="billing-module"><div className="billing-hero"><div><span className="billing-eyebrow">K HOTEL SDN BHD · BILLING</span><h2>Rental & Utilities</h2><p>Tenancies, meter readings and monthly invoice packs in one place.</p></div><div className="billing-test"><ShieldCheck size={20}/> Manual printing · Automatic printer not connected</div></div>{approver&&<><SignaturePad/><button type="button" onClick={()=>setTab("history")}>Review pending invoice packs ({state.pendingPackCount})</button></>}<div className="billing-tabs">{[['rental','Rental invoices'],['utility','Utility readings'],['registry','Registry'],['schedule','Schedule & holidays'],['history','Invoice history']].map(([key,label])=><button key={key} disabled={busy} className={tab===key?'selected':''} onClick={()=>setTab(key)}>{label}</button>)}</div><p className="billing-notice">Confirm all meter readings, then select Submit to Fikri for Verification. Review order: Fikri → Kevin → James.</p>{message&&<div className="billing-message" role="status">{message}</div>}
{tab==='registry'&&<BillingRegistry config={config} busy={busy} onSave={updated=>task(async()=>{const r=await saveBillingMetadata(updated,state.revision);setState({...state,config:updated,revision:r.revision});setMessage('Registry saved to the system.')})}/>}
{tab==='rental'&&<><div className="billing-toolbar"><label>Billing month<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><button disabled={busy} onClick={()=>task(async()=>view('rental'))}><FileText size={16}/> Preview invoices</button><button disabled={busy} onClick={()=>task(save)}><Save size={16}/> Save tenancy changes</button><button disabled={busy} onClick={()=>task(()=>submitPack('rental',month))}>Submit to Fikri for Verification</button></div><div className="billing-grid">{config.tenants.map((t,i)=><article className="billing-card" key={t.id}><span>{t.lot}</span><h3>{t.name}</h3><div className="billing-fields"><label>Monthly rent (RM)<input type="number" min="0" value={t.rent} onChange={e=>change({tenants:config.tenants.map((v,n)=>n===i?{...v,rent:Number(e.target.value)}:v)})}/></label><label>Start<input type="date" value={t.s} onChange={e=>change({tenants:config.tenants.map((v,n)=>n===i?{...v,s:e.target.value}:v)})}/></label><label>End<input type="date" value={t.e} onChange={e=>change({tenants:config.tenants.map((v,n)=>n===i?{...v,e:e.target.value}:v)})}/></label></div></article>)}</div></>}
{tab==='utility'&&<fieldset className="billing-upload-fieldset" disabled={busy}><div className="billing-toolbar"><strong>Billing month: {config.utilityPeriod}</strong><span className="billing-manual-print">Utilities · Manual printing only</span><button disabled={busy} onClick={()=>task(save)}><Save size={16}/> Save readings</button><button disabled={busy} onClick={()=>task(async()=>view('utility'))}>Preview utilities</button><button disabled={busy} onClick={()=>task(()=>submitPack('utility',config.utilityPeriod))}>Submit to Fikri for Verification</button></div>{orderedUtilityAccounts(config.utilityAccounts).filter(a=>utilityAccountEligible(a,config.utilityPeriod)).map(a=><article className="billing-card" key={a.id}><div className="billing-account-heading"><h3>{a.name}</h3><button type="button" aria-expanded={activeAccount===a.id} onClick={()=>setOpenAccount(activeAccount===a.id?"":a.id)}>{activeAccount===a.id?"Close readings":"Open readings"}</button><button disabled={busy} onClick={()=>task(()=>view("utility",a.id))}><FileText size={16}/> Preview invoice</button></div>{activeAccount===a.id&&<><p>{a.subsidy?`Company subsidy: RM ${a.subsidy}`:a.cap?`Agreement cap: RM ${a.cap}`:'Electricity / water charges'}</p><div className="billing-meters">{photoError&&!photosReady&&<button type="button" className="button secondary" onClick={()=>setRetryPhotos(value=>value+1)}>Retry photos</button>}{a.meters.map((m,i)=><div className="billing-meter" key={m.id+i}><b>{m.label} · {m.unit}</b><small>{m.serial||'Serial number not provided'} · {m.role}</small><div className="billing-fields"><label>Read first digits<select value={m.readingDigits??""} onChange={e=>change({utilityAccounts:config.utilityAccounts.map(ac=>({...ac,meters:ac.meters.map(v=>ac.id===a.id&&v.id===m.id?{...v,readingDigits:e.target.value?Number(e.target.value):null}:v)}))})}><option value="">Auto · whole digits</option>{Array.from({length:10},(_,n)=>n+1).map(n=><option key={n} value={n}>First {n} digits</option>)}</select><small>Applies to future photo readings. Save readings to keep this setting.</small></label><label>Previous<input type="number" value={m.prev??''} onChange={e=>change({utilityAccounts:config.utilityAccounts.map(ac=>({...ac,meters:ac.meters.map(v=>ac.id===a.id&&v.id===m.id?{...v,prev:e.target.value===''?null:Number(e.target.value),confirmed:false}:v)}))})}/></label><label>Current (whole digits only)<input type="text" inputMode="numeric" pattern="[0-9]*" value={m.curr??''} onChange={e=>change({utilityAccounts:config.utilityAccounts.map(ac=>({...ac,meters:ac.meters.map(v=>ac.id===a.id&&v.id===m.id?{...v,curr:e.target.value===''?null:Number(e.target.value),confirmed:false}:v)}))})}/></label><label>Previous reading date<input type="date" value={m.previousDate||previousMonthDate(config.utilityPeriod)} onChange={e=>change({utilityAccounts:config.utilityAccounts.map(ac=>({...ac,meters:ac.meters.map(v=>ac.id===a.id&&v.id===m.id?{...v,previousDate:e.target.value}:v)}))})}/></label><label>Current reading date<input type="date" value={m.currentDate||config.utilityPeriod+"-01"} onChange={e=>change({utilityAccounts:config.utilityAccounts.map(ac=>({...ac,meters:ac.meters.map(v=>ac.id===a.id&&v.id===m.id?{...v,currentDate:e.target.value,confirmed:false}:v)}))})}/></label><label>Rate (RM)<input type="number" value={m.rate} step=".01" onChange={e=>change({utilityAccounts:config.utilityAccounts.map(ac=>({...ac,meters:ac.meters.map(v=>ac.id===a.id&&v.id===m.id?{...v,rate:Number(e.target.value),confirmed:false}:v)}))})}/></label></div><button disabled={busy} onClick={()=>task(async()=>{if(m.curr===null||!Number.isInteger(m.curr)||m.prev===null||m.curr<m.prev)throw Error("Enter a whole-number reading at or above Previous.");const updated={...config,utilityAccounts:config.utilityAccounts.map(ac=>({...ac,meters:ac.meters.map(v=>ac.id===a.id&&v.id===m.id?{...v,confirmed:true}:v)}))};const saved=await saveBillingMetadata(updated,state.revision);setState({...state,config:updated,revision:saved.revision});setMessage("Corrected reading saved and confirmed. Invoice uses your entered number.")})}>Save & confirm reading</button><label className="billing-check"><input type="checkbox" checked={m.confirmed} onChange={e=>change({utilityAccounts:config.utilityAccounts.map(ac=>({...ac,meters:ac.meters.map(v=>ac.id===a.id&&v.id===m.id?{...v,confirmed:e.target.checked}:v)}))})}/> Reading checked against photo</label>{photosReady ? <><MeterPhotoControl label={m.label} busy={busy} onPhoto={file=>{void task(async()=>photo(file,a.id,m.id))}}/><BillingMeterPhotos busy={busy} onReplace={(file,side)=>{void task(async()=>photo(file,a.id,m.id,side==="Previous"?"previous":"current"))}} label={m.label} previousPhoto={m.previousPhoto} photo={m.photo} previousDate={m.previousDate||previousMonthDate(config.utilityPeriod)} currentDate={m.currentDate||config.utilityPeriod+"-01"} previous={m.prev} current={m.curr}/>{m.photo&&<button disabled={busy} onClick={()=>task(async()=>readPhoto(state,a.id,m.id))}>Read photo again</button>}</> : <p className="subtle" role="status">{photoError || "Loading meter photos…"}</p>}</div>)}</div><p>Total: {(()=>{try{return 'RM '+money(utilityLine(a,config.utilityPeriod).amount)}catch{return 'Confirm valid readings to calculate'}})()}</p></>}</article>)}<p>Months are prepared automatically. Previous photos and readings are carried forward; each save is kept in <a href="/documents/utility-readings">Utility reading history</a>.</p></fieldset>}
{tab==='schedule'&&<div className="billing-card"><h3><CalendarClock size={20}/> Monthly rental schedule</h3><p>Rental invoices only. Utilities are printed manually. Starts on day 1. Skips Sundays and listed holidays, including substitute holidays. Saturdays remain eligible.</p><label className="billing-check"><input type="checkbox" checked={config.enabled} onChange={e=>change({enabled:e.target.checked})}/> Enable rental schedule</label><div className="billing-fields"><label>Malaysia execution time<input type="time" value={config.time} onChange={e=>change({time:e.target.value})}/></label><label>Start month<input type="month" value={config.startPeriod} onChange={e=>change({startPeriod:e.target.value})}/></label><label>Holiday calendar checked through<input type="date" value={config.reviewedUntil} onChange={e=>change({reviewedUntil:e.target.value})}/></label></div><label>Holiday dates, including substitute and special holidays<textarea rows={7} value={config.holidays.join('\n')} onChange={e=>change({holidays:e.target.value.split(/\s+/).filter(Boolean)})}/></label><label>Calendar source / review note<input value={config.calendarSource} onChange={e=>change({calendarSource:e.target.value})}/></label><p>Earliest eligible date for {month}: <b>{(()=>{try{return nextBillingDay(month,config.holidays)}catch{return 'Check input'}})()}</b></p><p>The calendar starts with November / December 2026 reference dates. Check the official calendar and any later announcements before marking it reviewed. Unknown coverage blocks generation.</p><button disabled={busy} onClick={()=>task(save)}>Save schedule</button><hr/><h3>Test a date</h3><div className="billing-fields"><label>Simulated date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Simulated Malaysia time<input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label></div><div className="billing-toolbar"><button disabled={busy} onClick={()=>task(async()=>{const r=await api({action:'simulate',date,time});setMessage(`Test result: ${r.status}. Eligible date: ${r.due}. No invoice or print created.`)})}>Check date rules</button><button disabled={busy} onClick={()=>task(async()=>{const r=await api({action:'generate',kind:'rental',period:date.slice(0,7),date,time});setPreview(r.snapshot);await load();setMessage('Rental invoice pack submitted for Fikri verification. Printing waits for Fikri, Kevin and James.')} )}>Generate rental invoice pack</button></div><p className="billing-notice">For automatic rental printing, connect the office PC in Office printer and enable rental auto-print there. The office PC must be on and signed in. Check date rules only simulates the selected date. Utilities stay manual.</p></div>}
{tab==='history'&&<p><a href="/documents/utility-readings">Open monthly meter photos & reading history</a></p>}
{tab==='history'&&<BillingMailPanel canManage={canManageMail}/>}
{tab==='history'&&<><BillingPayments canManage={canManageMail} accounts={[...state.config.tenants.map(t=>({kind:'rental',key:String(t.id),name:t.name})),...state.config.utilityAccounts.map(a=>({kind:'utility',key:a.id,name:a.name}))]}/><div className="billing-card"><h3>Invoice packs · Verification & approval</h3><p>Saved packs are fixed snapshots. Changing rates or tenancies does not overwrite them.</p>{historyError?<p role="alert">{historyError} <button type="button" onClick={()=>setRefreshHistory(value=>value+1)}>Retry history</button></p>:history===null?<p role="status">Loading invoice history…</p>:!history.length?<p>No invoice packs saved.</p>:history.map(r=><div className="billing-history" key={r.id} id={`invoice-${r.id}`}><div><b>{r.kind==='rental'?'Rental':'Utilities'} · {r.period}</b><small>Invoice date: {r.issue_date} · RM {money(r.total)} · {documentReviewStatus(r.verifiedCount,r.approved)}</small>{r.approved&&<small>Email: {r.mail?.status||'Not sent'}{r.mail?.sent_at?' · '+new Date(r.mail.sent_at).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur'})+' MYT':''}{r.mail?.error?' · '+r.mail.error:''}</small>}</div><button disabled={busy} onClick={()=>task(()=>openPack(r.id))}>View pack</button><a className="button secondary" href={'/admin/document-review/billing/'+r.id}>Open review status</a>{canManageMail&&r.approved&&r.mail?.status!=="sent"&&<button disabled={busy} onClick={()=>task(()=>sendMail(r.id))}>{r.mail?.status==="sending"?"Check email status":"Send / check email"}</button>}</div>)}</div></>}
{preview&&<div ref={previewBox} role="dialog" aria-modal="true" aria-label="Invoice preview" className="billing-card billing-preview"><div className="billing-toolbar"><h3>Invoice preview · {preview.period}</h3>{previewRun&&<a className="button secondary" href={'/admin/document-review/billing/'+previewRun.id}>Open verification & approval</a>}<button onClick={()=>{void printPack(preview).catch(e=>setMessage((e as Error).message))}}><Printer size={16}/> Print / Save PDF</button><button onClick={()=>setPreview(null)}>Close preview</button></div><p>Issue date: {preview.issueDate} · {previewRun?documentReviewStatus(previewRun.verifiedCount,previewRun.approved):"Preview only · Not submitted for verification"}</p>{message&&<p role="status">{message}</p>}{previewHtml?<iframe title="Invoice document preview" className="billing-invoice-frame" sandbox="allow-same-origin allow-modals" srcDoc={previewHtml}/>:<p role="status">Loading invoice preview…</p>}{preview.lines.map(l=><div className="billing-history" key={l.billNo}><div><b>{l.name}</b><small>{l.billNo} · {l.description}</small></div><strong>RM {money(l.amount)}</strong></div>)}<h3>Total: RM {money(preview.total)}</h3></div>}</div>}

function previousMonthDate(p:string){const d=new Date(p+"-01T00:00:00Z");d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,10)}
