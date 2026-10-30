"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {createClient} from "@/lib/supabase/client";
import {inspectionFindings,type ABInspection} from "@/lib/checkout-inspection";
import {prepareInspectionPhotos,submitABInspection} from "@/app/(dashboard)/admin/checkouts/inspection/actions";

export function CheckoutABInspector(){
 const frame=useRef<HTMLIFrameElement>(null),pending=useRef(false);
 const [progress,setProgress]=useState(""),[error,setError]=useState(""),[saved,setSaved]=useState<{id:string;reference_no:string}|null>(null),[round,setRound]=useState(0);
 useEffect(()=>{
  async function receive(event:MessageEvent){
   if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow||event.data?.type!=="klg-inspection-submit"||pending.current)return;
   pending.current=true;setError("");setProgress("Preparing inspection…");
   try{
    const record=event.data.record as ABInspection;
    const findings=inspectionFindings(record);
    const images=findings.flatMap((f,index)=>f.photos.map(url=>({url,index})));
    const blobs=await Promise.all(images.map(async image=>{
     if(!/^data:image\/(jpeg|png|webp);base64,/.test(image.url))throw new Error("Invalid photo. Please upload the photo again.");
     return (await fetch(image.url)).blob();
    }));
    const prepared=await prepareInspectionPhotos(record.id,blobs.map(b=>({type:b.type,size:b.size})));
    if("error" in prepared)throw new Error(prepared.error);
    const uploaded=findings.map(f=>({description:f.description,photos:[] as string[]}));
    const storage=createClient().storage.from("checkout-evidence");
    for(let i=0;i<blobs.length;i++){
     setProgress(`Uploading photo ${i+1} of ${blobs.length}…`);
     const upload=prepared.uploads[i],result=await storage.uploadToSignedUrl(upload.path,upload.token,blobs[i]);
     if(result.error)throw new Error(`Photo ${i+1} failed: ${result.error.message}`);
     uploaded[images[i].index].photos.push(upload.path);
    }
    setProgress("Creating check-out room defect form…");
    // Store the complete checklist without inline image data; evidence remains in private storage.
    const checklist=JSON.parse(JSON.stringify(record,(key,value)=>key==="photos"?undefined:value));
    const result=await submitABInspection({id:record.id,block:record.b,room:record.room.replace(/^[AB]/,""),pax:record.p,notes:`${record.date} · ${record.by} · ${record.reason}`,checklist,findings:uploaded});
    if("error" in result)throw new Error(result.error);
    setSaved(result.room);
    frame.current?.contentWindow?.postMessage({type:"klg-inspection-saved"},window.location.origin);
   }catch(cause){setError(cause instanceof Error?cause.message:"Unable to submit inspection. Please try again.");}
   finally{pending.current=false;setProgress("");frame.current?.contentWindow?.postMessage({type:"klg-inspection-unlock"},window.location.origin);}
  }
  window.addEventListener("message",receive);return()=>window.removeEventListener("message",receive);
 },[]);
 return <section>{saved?<div className="panel"><h3>Inspection submitted successfully</h3><p>{saved.reference_no} is now in the Check-out Progress Table, ready to assign.</p><div className="checkout-page-actions"><Link className="button" href="/admin/checkouts">Assign rooms</Link><Link className="button secondary" href={`/admin/checkouts/${saved.id}`}>View defect form</Link><button className="button secondary" onClick={()=>{setSaved(null);setRound(n=>n+1)}}>Inspect another room</button></div></div>:<>{error&&<p className="error" role="alert">{error} Your inspection is still open below.</p>}{progress&&<div className="panel" role="status">{progress}</div>}<iframe ref={frame} key={round} title="Block A and B room inspection" src="/checkout-ab-inspection.html" style={{width:"100%",height:"calc(100dvh - 160px)",minHeight:540,border:"1px solid #e7e0d0",borderRadius:16,pointerEvents:progress?"none":"auto"}}/></>}</section>;
}
