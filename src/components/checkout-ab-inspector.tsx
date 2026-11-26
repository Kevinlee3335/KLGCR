"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import frameStyles from "./checkout-inspection-frame.module.css";
import {createClient} from "@/lib/supabase/client";
import {cdInspectionFindings,cdUploadedPhotoGroups,type CDInspection} from "@/lib/checkout-cd-inspection";
import {inspectionFindings,type ABInspection} from "@/lib/checkout-inspection";
import {CHECKOUT_PHOTO_UPLOAD_CONCURRENCY,mapCheckoutPhotos} from "@/lib/checkout-photo-uploads";
import {RecentRoomInspectionDialog,type RecentInspection} from "./recent-room-inspection-dialog";
import {getRecentRoomInspection,prepareInspectionPhotos,submitABInspection} from "@/app/(dashboard)/admin/checkouts/inspection/actions";

type SavedInspection={checklist:unknown;created_at:string;rectifiedItems?:string[]};
const EMPTY_INSPECTIONS:SavedInspection[]=[];
export function CheckoutABInspector({isAdmin=true,initialInspections=EMPTY_INSPECTIONS,loadError=false,blocks="AB"}:{blocks?:"AB"|"CD";isAdmin?:boolean;initialInspections?:SavedInspection[];loadError?:boolean}){
 const router=useRouter();
 const [expanded,setExpanded]=useState(false);
 useEffect(()=>{
  if(!expanded)return;
  const previous=document.body.style.overflow;document.body.style.overflow="hidden";
  const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setExpanded(false);};
  window.addEventListener("keydown",escape);
  return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",escape);};
 },[expanded]);
 const [recent,setRecent]=useState<{room:string;request:number;record:RecentInspection}|null>(null);
 const recentLookup=useRef(0);
 const [inspections,setInspections]=useState(initialInspections);
 const frame=useRef<HTMLIFrameElement>(null),pending=useRef(false);
 const [progress,setProgress]=useState(""),[error,setError]=useState(""),[saved,setSaved]=useState<{id:string;reference_no:string}|null>(null),[round,setRound]=useState(0);
 useEffect(()=>{
  setInspections(initialInspections);
  frame.current?.contentWindow?.postMessage({type:"klg-inspection-records",records:initialInspections},window.location.origin);
 },[initialInspections]);
 useEffect(()=>{
  const refresh=()=>{if(document.visibilityState==="visible"&&!pending.current)router.refresh();};
  const timer=window.setInterval(refresh,60000);
  window.addEventListener("focus",refresh);
  return()=>{window.clearInterval(timer);window.removeEventListener("focus",refresh);};
 },[blocks,router]);
 useEffect(()=>{
  async function receive(event:MessageEvent){
   if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow||pending.current)return;
   if(event.data?.type==="klg-inspection-refresh"){router.refresh();return;}
   if(!isAdmin&&event.data?.type==="klg-inspection-recent"){
    if(event.data.startAfter)frame.current?.contentWindow?.postMessage({type:"klg-inspection-continue",room:event.data.room,request:event.data.request},window.location.origin);
    return;
   }
   if(isAdmin&&event.data?.type==="klg-inspection-recent"){
    const {room,request,startAfter}=event.data;
    const lookup=++recentLookup.current;
    setRecent(null);
    setError("");
    if(typeof room!=="string"||!new RegExp(`^[${blocks}]\\d{3}$`).test(room)||!Number.isSafeInteger(request))return;
    try{
     const result=await getRecentRoomInspection(room);
     if(lookup!==recentLookup.current)return;
     if(result.error){setError(result.error);return;}
     if(result.record){setRecent({room,request,record:result.record});return;}
     if(startAfter) frame.current?.contentWindow?.postMessage({type:"klg-inspection-continue",room,request},window.location.origin);
    }catch{
     if(lookup===recentLookup.current)setError("Could not check previous inspections. Please try again.");
    }
    return;
   }
   if(event.data?.type!=="klg-inspection-submit")return;
   pending.current=true;setError("");setProgress(isAdmin?"Preparing inspection…":"Menyediakan pemeriksaan…");
   try{
    const record=event.data.record as ABInspection|CDInspection;
    if(!blocks.includes(record.b))throw new Error("Invalid inspection block.");
    const findings=blocks==="CD"?cdInspectionFindings(record as CDInspection):inspectionFindings(record as ABInspection);
    const images=findings.flatMap((f,index)=>f.photos.map(url=>({url,index})));
    const blobs=await Promise.all(images.map(async image=>{
     if(!/^data:image\/(jpeg|png|webp);base64,/.test(image.url))throw new Error("Invalid photo. Please upload the photo again.");
     return (await fetch(image.url)).blob();
    }));
    const prepared=await prepareInspectionPhotos(record.id,blobs.map(b=>({type:b.type,size:b.size})));
    if("error" in prepared)throw new Error(prepared.error);
    const uploaded=findings.map(f=>({description:f.description,photos:[] as string[]}));
    const storage=createClient().storage.from("checkout-evidence");
    let count=0;
    const showUploadProgress=()=>setProgress(isAdmin?`Uploaded ${count} of ${blobs.length} photos…`:`${count} daripada ${blobs.length} gambar dimuat naik…`);
    if(blobs.length)showUploadProgress();
    const paths=await mapCheckoutPhotos(blobs,CHECKOUT_PHOTO_UPLOAD_CONCURRENCY,async(blob,index)=>{
     const {path,token}=prepared.uploads[index];
     const {error}=await storage.uploadToSignedUrl(path,token,blob);
     if(error)throw new Error(`Photo ${index+1} failed: ${error.message}`);
     count+=1;
     showUploadProgress();
     return path;
    });
    paths.forEach((path,index)=>uploaded[images[index].index].photos.push(path));
    setProgress(isAdmin?"Creating check-out room defect form…":"Menyediakan borang kerosakan bilik…");
    // Store the complete checklist without inline image data; evidence remains in private storage.
    const checklist=JSON.parse(JSON.stringify(record,(key,value)=>key==="photos"||key==="ph"?undefined:value));
    if(blocks==="CD"){
     checklist.ph=cdUploadedPhotoGroups(record as CDInspection,images,paths);
    }
    const result=await submitABInspection({id:record.id,block:record.b,room:String(record.room).replace(/^[ABCD]/,""),pax:"t" in record?record.t:record.p,notes:`${record.date} · ${record.by} · ${record.reason}`,checklist,findings:uploaded});
    if("error" in result)throw new Error(result.error);
    const displayChecklist=structuredClone(checklist);
    if(blocks==="CD"){
     try{
      const drafts=JSON.parse(localStorage.getItem("klg-checkout-cd-drafts")||"[]") as {id:string}[];
      localStorage.setItem("klg-checkout-cd-drafts",JSON.stringify(drafts.filter(draft=>draft.id!==record.id)));
     }catch{}
    }
    if(blocks==="CD"&&paths.length){
     try{
      const {data}=await storage.createSignedUrls(paths,3600);
      const urls=new Map((data||[]).map(photo=>[photo.path,photo.signedUrl]));
      for(const key of Object.keys(displayChecklist.ph))displayChecklist.ph[key]=displayChecklist.ph[key].flatMap((path:string)=>urls.get(path)?[urls.get(path)!]:[]);
     }catch{displayChecklist.ph={};}
    }
    setInspections(previous=>[{checklist:displayChecklist,created_at:new Date().toISOString()},...previous.filter(row=>(row.checklist as {id?:string})?.id!==record.id)]);
    setSaved(result.room);
    setExpanded(false);
    frame.current?.contentWindow?.postMessage({type:"klg-inspection-saved"},window.location.origin);
   }catch(cause){setError(cause instanceof Error?cause.message:"Unable to submit inspection. Please try again.");}
   finally{pending.current=false;setProgress("");frame.current?.contentWindow?.postMessage({type:"klg-inspection-unlock"},window.location.origin);}
  }
  window.addEventListener("message",receive);return()=>window.removeEventListener("message",receive);
 },[isAdmin,blocks,router]);
 return <section>{recent&&<RecentRoomInspectionDialog room={recent.room} record={recent.record} allowNewInspection={blocks!=="CD"||recent.record.status==="ready_for_occupancy"}
  onClose={()=>setRecent(null)} onContinue={()=>{
   frame.current?.contentWindow?.postMessage({type:"klg-inspection-continue",room:recent.room,request:recent.request},window.location.origin);
   setRecent(null);
  }}/>} {saved?<div className="panel"><h3>{isAdmin?"Inspection submitted successfully":"Pemeriksaan berjaya dihantar"}</h3><p>{isAdmin?`${saved.reference_no} is now in the Check-out Progress Table, ready to assign.`:`${saved.reference_no} telah dihantar untuk tindakan seterusnya.`}</p><div className="checkout-page-actions">{isAdmin&&<><Link className="button" href="/admin/checkouts">Assign rooms</Link><Link className="button secondary" href={`/admin/checkouts/${saved.id}`}>View defect form</Link></>}<button className="button secondary" onClick={()=>{setSaved(null);setRound(n=>n+1)}}>{isAdmin?"Inspect another room":"Periksa bilik lain"}</button></div></div>:<>{error&&<p className="error" role="alert">{isAdmin?error:"Pemeriksaan tidak dapat dihantar. Sila semak maklumat dan gambar, kemudian cuba lagi. Jika masih gagal, hubungi admin."} {isAdmin?"Your inspection is still open below.":"Pemeriksaan masih terbuka di bawah."}</p>}{progress&&<div className="panel" role="status">{progress}</div>}{loadError&&<p className="error" role="alert">{isAdmin?"Unable to load saved inspections. Please refresh or contact admin.":"Tidak dapat memuatkan pemeriksaan. Sila muat semula atau hubungi admin."}</p>}<div className={expanded?frameStyles.expanded:frameStyles.frame} aria-label={blocks==="CD"?"C/D inspection workspace":undefined}>{blocks==="CD"&&<div className={frameStyles.toolbar}><strong>{isAdmin?"C/D Inspection Summary & Details":"Ringkasan & Pemeriksaan C/D"}</strong><button type="button" className="button secondary" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?(isAdmin?"Exit expanded view":"Tutup paparan besar"):(isAdmin?"Expand view":"Besarkan paparan")}</button></div>}<iframe ref={frame} key={round} onLoad={()=>frame.current?.contentWindow?.postMessage({type:"klg-inspection-records",records:inspections},window.location.origin)} title={blocks==="CD"?"Block C and D room inspection":"Block A and B room inspection"} src={blocks==="CD"?(isAdmin?"/checkout-cd-inspection.html":"/checkout-cd-inspection.html?lang=ms"):isAdmin?"/checkout-ab-inspection.html":"/checkout-ab-inspection.html?lang=ms"} style={{width:"100%",height:blocks==="CD"?"calc(100dvh - 100px)":"calc(100dvh - 160px)",minHeight:blocks==="CD"?720:540,border:"1px solid #e7e0d0",borderRadius:16,pointerEvents:progress?"none":"auto"}}/></div></>}</section>;
}
