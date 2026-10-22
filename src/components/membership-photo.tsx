"use client";
import "./membership-photo.css";
import { Camera, UploadCloud, UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export function MembershipPhoto({accessCard=false}:{accessCard?:boolean}) {
 const id=useId();
 const input=useRef<HTMLInputElement>(null);
 const [photo,setPhoto]=useState<File|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [preview,setPreview]=useState("");
 useEffect(()=>{if(!photo){setPreview("");return;}const url=URL.createObjectURL(photo);setPreview(url);return()=>URL.revokeObjectURL(url);},[photo]);
 function choose(camera:boolean){
  if(!input.current)return;
  if(camera)input.current.setAttribute("capture",accessCard?"environment":"user");else input.current.removeAttribute("capture");
  input.current.click();
 }
 async function prepare(file:File){
  if(!input.current)return;
  setError("");setBusy(true);input.current.setCustomValidity("Please wait for your photo to finish preparing.");
  try{
   if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>20*1024*1024)throw new Error("Choose a JPG, PNG or WebP photo up to 20 MB.");
   const url=URL.createObjectURL(file);
   let image:HTMLImageElement;
   try{image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("This photo could not be opened. Choose a JPG or PNG photo."));img.src=url;});}finally{URL.revokeObjectURL(url);}
   const scale=Math.min(1,1000/Math.max(image.width,image.height));
   const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
   const context=canvas.getContext("2d");if(!context)throw new Error("Unable to prepare your photo. Please try another browser.");
   context.fillStyle="#ffffff";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("Unable to prepare your photo.")),"image/jpeg",0.82));
   if(blob.size>1024*1024)throw new Error("Please choose a smaller photo.");
   const normalized=new File([blob],"personal-photo.jpg",{type:"image/jpeg"});
   const files=new DataTransfer();files.items.add(normalized);input.current.files=files.files;input.current.setCustomValidity("");setPhoto(normalized);
  }catch(cause){input.current.value="";input.current.setCustomValidity("");setPhoto(null);setError(cause instanceof Error?cause.message:"Unable to prepare your photo.");}
  finally{setBusy(false);}
 }
 return <section className={accessCard?"wide membership-photo-field receipt-field":"membership-photo-field receipt-field"} aria-labelledby={id+"-label"} style={{position:"relative",...(accessCard?{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,260px),1fr))",gap:16}: {})}}>
  <strong style={accessCard?{gridColumn:"1/-1"}:undefined} id={id+"-label"}>{accessCard?"Access Card photo":"Personal photo"}</strong>
  <div className={accessCard?"access-card-upload-layout":"personal-photo-layout"}>
  <div className="receipt-upload" style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:10,alignSelf:"start",minHeight:150}}>
   {preview?<img src={preview} alt="Your selected personal photo" style={{width:64,height:80,objectFit:"cover",borderRadius:12}}/>:<UserRound size={30} aria-hidden="true"/>}
   <div className="receipt-upload-copy"><strong>{busy?"Preparing photo…":photo?(accessCard?"Access Card added":"Personal photo added"):(accessCard?"Upload a clear Access Card photo":"Add your personal photo")}</strong><small>{accessCard?"Keep the entire code at the bottom clearly visible. You may cover your password.":"Take a photo or upload one from your device."}</small>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
     <button type="button" className="button secondary" disabled={busy} onClick={()=>choose(true)}><Camera size={18} aria-hidden="true"/> Take photo</button>
     <button type="button" className="button secondary" disabled={busy} onClick={()=>choose(false)}><UploadCloud size={18} aria-hidden="true"/> Upload photo</button>
    </div>
   </div>
  </div>
  {!accessCard && <aside className="personal-photo-examples" aria-label="Personal photo examples"><strong>Photo examples</strong><div className="personal-photo-example-pair">{["male","female"].map(gender=><figure key={gender}><img src={`/personal-photo-example-${gender}-v3.jpg`} alt={`AI-generated ${gender} headshot showing a clear front-facing personal photo`} width={240} height={320}/><figcaption>{gender==="male"?"Male":"Female"}</figcaption></figure>)}</div><small>AI-generated examples only. Do not upload these photos.</small></aside>}
  </div>
  <input ref={input} id={id} name={accessCard?"access_card":"personal_photo"} type="file" accept="image/jpeg,image/png,image/webp" required aria-label={accessCard?"Access Card photo":"Personal photo"} aria-describedby={id+"-help"} style={{position:"absolute",width:1,height:1,opacity:0,bottom:0,left:0}} onChange={event=>{const file=event.currentTarget.files?.[0];if(file)void prepare(file);}}/>
  {accessCard&&<figure style={{margin:"16px 0 0",maxWidth:360}}><a href="/access-card-sample-v2.png" target="_blank" rel="noreferrer"><img src="/access-card-sample-v2.png" alt="Access Card sample with password covered and bottom activation code clearly visible" style={{width:"100%",borderRadius:12,border:"1px solid #e5dcc8"}}/></a><figcaption style={{fontSize:12,marginTop:8}}>Sample · Click to enlarge. Photograph your own card with the bottom code in focus.</figcaption></figure>}
  <small style={accessCard?{gridColumn:"1/-1"}:undefined} id={id+"-help"}>{accessCard?"Required for Residence tenants. Management needs the bottom code to activate your card.":"Upload a clear, recent photo of yourself with your full face visible. Admin may reject your registration if you do not upload your own photo."}</small>

  {error&&<p className="error" role="alert">{error}</p>}
 </section>;
}
