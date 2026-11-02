"use client";
import {useEffect,useState} from "react";
import {MeterPhotoControl} from "./meter-photo-control";
import {BillingMeterPhotos} from "./billing-meter-photos";
import type {UtilityPhotoData} from "@/lib/utility-photo-access";
async function request(body?:unknown,query=""):Promise<UtilityPhotoData & {message?:string}>{const response=await fetch("/api/utility-photos"+query,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{cache:"no-store"});const result=await response.json();if(!response.ok)throw Error(result.error||"Unable to load utilities");return result}
async function compress(file:File){if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error("Choose a JPG, PNG or WebP photo.");const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext("2d");if(!ctx)throw Error("Camera image could not be processed");ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);for(const q of [.8,.65,.5,.35]){const data=canvas.toDataURL("image/jpeg",q);if(data.length<=220000)return data}throw Error("Photo is too large. Take a closer photo of the meter digits.")}finally{bitmap.close()}}
export function UtilityPhotoPanel(){const [opened,setOpened]=useState<string|null>(null);const [state,setState]=useState<UtilityPhotoData|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[search,setSearch]=useState("");
 async function reload(account?:string){setBusy(true);try{const result=await request(undefined,account?"?"+new URLSearchParams({account}):"");setOpened(account??null);setState(result);setMessage("")}catch(e){setMessage(e instanceof Error?e.message:"Unable to load utilities")}finally{setBusy(false)}}
 useEffect(()=>{void reload()},[]);
 async function save(file:File,accountId:string,meterId:string){if(!state||busy)return;setBusy(true);setMessage("Saving photo and reading the meter…");try{const photo=await compress(file);const saved=await request({period:state.period,revision:state.revision,accountId,meterId,photo});setState(saved);setMessage(saved.message||"Photo saved. Admin can now review the reading.")}catch(e){setMessage(e instanceof Error?e.message:"Unable to save photo")}finally{setBusy(false)}}
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
      <MeterPhotoControl hint="Photo saves automatically, then AI reads the meter. Admin will check and confirm the suggested reading." label={a.name+" · "+m.label} busy={busy} onPhoto={file=>void save(file,a.id,m.id)}/>
      <BillingMeterPhotos label={a.name+" · "+m.label} previousPhoto={m.previousPhoto} photo={m.photo} previousDate={m.previousDate||"Previous month"} currentDate={m.currentDate||state.period+"-01"} previous={m.prev} current={m.curr}/>
    </div>)}</div>}
  </article>)}
  {state&&!state.accounts.length&&<p>No utility meters are available for this month.</p>}
 </div>
}
