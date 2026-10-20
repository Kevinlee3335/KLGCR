"use client";
import { Camera, UploadCloud, UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export function MembershipPhoto() {
 const id=useId();
 const input=useRef<HTMLInputElement>(null);
 const [photo,setPhoto]=useState<File|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [preview,setPreview]=useState("");
 useEffect(()=>{if(!photo){setPreview("");return;}const url=URL.createObjectURL(photo);setPreview(url);return()=>URL.revokeObjectURL(url);},[photo]);
 function choose(camera:boolean){
  if(!input.current)return;
  if(camera)input.current.setAttribute("capture","user");else input.current.removeAttribute("capture");
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
 return <section className="wide receipt-field" aria-labelledby={id+"-label"} style={{position:"relative"}}>
  <strong id={id+"-label"}>Personal photo</strong>
  <div className="receipt-upload" style={{marginTop:10,display:"flex",flexWrap:"wrap",gap:18}}>
   {preview?<img src={preview} alt="Your selected personal photo" style={{width:100,height:120,objectFit:"cover",borderRadius:12}}/>:<UserRound size={42} aria-hidden="true"/>}
   <div className="receipt-upload-copy"><strong>{busy?"Preparing photo…":photo?"Personal photo added":"Add your personal photo"}</strong><small>Take a photo or upload one from your device.</small>
    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>
     <button type="button" className="button secondary" disabled={busy} onClick={()=>choose(true)}><Camera size={18} aria-hidden="true"/> Take photo</button>
     <button type="button" className="button secondary" disabled={busy} onClick={()=>choose(false)}><UploadCloud size={18} aria-hidden="true"/> Upload photo</button>
    </div>
   </div>
  </div>
  <input ref={input} id={id} name="personal_photo" type="file" accept="image/jpeg,image/png,image/webp" required aria-label="Personal photo" aria-describedby={id+"-help"} style={{position:"absolute",width:1,height:1,opacity:0,bottom:0,left:0}} onChange={event=>{const file=event.currentTarget.files?.[0];if(file)void prepare(file);}}/>
  <small id={id+"-help"}>Required for new registration. Your photo will be saved with your membership details.</small>
  {error&&<p className="error" role="alert">{error}</p>}
 </section>;
}
