"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Upload } from "lucide-react";

export function MeterPhotoControl({label,busy,onPhoto,hint="Photo saves automatically, then AI reads the meter. Check the suggested reading before confirming."}:{label:string;busy:boolean;onPhoto:(file:File)=>void;hint?:string}) {
  const camera=useRef<HTMLInputElement>(null);
  const upload=useRef<HTMLInputElement>(null);
  const video=useRef<HTMLVideoElement>(null);
  const stream=useRef<MediaStream|null>(null);
  const mounted=useRef(true);
  const [cameraOpen,setCameraOpen]=useState(false);
  const [opening,setOpening]=useState(false);
  const [error,setError]=useState('');
  function closeCamera(){stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;setCameraOpen(false)}
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stream.current?.getTracks().forEach(track=>track.stop())}},[]);
  useEffect(()=>{if(cameraOpen&&video.current&&stream.current){video.current.srcObject=stream.current;void video.current.play().catch(()=>setError('Press play on the camera preview, then take the photo.'))}},[cameraOpen]);
  async function openCamera(){
    setError('');
    const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(/Macintosh/i.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
    if(mobile){camera.current?.click();return}
    if(!navigator.mediaDevices?.getUserMedia){setError('Camera is unavailable in this browser. Use Upload photo.');return}
    setOpening(true);
    try{const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(!mounted.current){media.getTracks().forEach(track=>track.stop());return}stream.current=media;setCameraOpen(true)}catch{setError('Unable to open the camera. Check camera permission, or use Upload photo.')}finally{if(mounted.current)setOpening(false)}
  }
  async function capturePhoto(){
    const element=video.current;
    if(!element?.videoWidth){setError('Wait for the camera preview to load.');return}
    const canvas=document.createElement('canvas');canvas.width=element.videoWidth;canvas.height=element.videoHeight;
    canvas.getContext('2d')!.drawImage(element,0,0);
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));
    if(!blob){setError('Unable to capture the photo. Please try again.');return}
    closeCamera();onPhoto(new File([blob],'meter-camera.jpg',{type:'image/jpeg'}));
  }
  const receive=(input:HTMLInputElement)=>{
    const file=input.files?.[0];
    input.value="";
    if(file)onPhoto(file);
  };
  return <div className="billing-photo-controls">
    <button type="button" disabled={busy||opening} aria-label={`Take photo for ${label}`} onClick={()=>void openCamera()}><Camera size={18}/> {opening?'Opening camera…':'Take photo'}</button>
    <button type="button" disabled={busy} aria-label={`Upload photo for ${label}`} onClick={()=>upload.current?.click()}><Upload size={18}/> Upload photo</button>
    <input ref={camera} hidden type="file" accept="image/*" capture="environment" aria-label={`Camera photo for ${label}`} disabled={busy} onChange={e=>receive(e.currentTarget)}/>
    <input ref={upload} hidden type="file" accept="image/*" aria-label={`Photo file for ${label}`} disabled={busy} onChange={e=>receive(e.currentTarget)}/>
    <small>{hint}</small>
    {error&&<small role="alert">{error}</small>}
    {cameraOpen&&<div className="billing-camera-overlay"><div className="billing-camera-dialog" role="dialog" aria-modal="true" aria-label={`Camera for ${label}`}><h3>{label}</h3><video ref={video} autoPlay muted playsInline controls/><div><button type="button" disabled={busy} onClick={()=>void capturePhoto()}><Camera size={18}/> Capture photo</button><button type="button" onClick={closeCamera}>Cancel camera</button></div></div></div>}
  </div>;
}
