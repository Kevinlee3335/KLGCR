"use client";

import { Camera, ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";

export function CompletionPhotoPicker(){
  const cameraRef=useRef<HTMLInputElement>(null);
  const uploadRef=useRef<HTMLInputElement>(null);
  const [file,setFile]=useState<File|null>(null);
  const [preview,setPreview]=useState<string|null>(null);
  const choose=(next?:File)=>{
    if(preview) URL.revokeObjectURL(preview);
    if(!next){setFile(null);setPreview(null);return}
    setFile(next);setPreview(URL.createObjectURL(next));
  };
  return <div className="completion-photo-picker">
    <div className="completion-photo-heading"><strong>📷 Completion Photo *</strong><span>Take a new photo or choose one from your phone.</span></div>
    <input ref={cameraRef} className="visually-hidden-file" type="file" accept="image/*" capture="environment" onChange={e=>choose(e.target.files?.[0])}/>
    <input ref={uploadRef} className="visually-hidden-file" type="file" accept="image/*" onChange={e=>choose(e.target.files?.[0])}/>
    <input className="visually-hidden-file" type="file" name="completionPhoto" required={!file} tabIndex={-1} aria-hidden="true"/>
    <div className="completion-photo-actions"><button type="button" className="button secondary" onClick={()=>cameraRef.current?.click()}><Camera size={18}/>Take Photo</button><button type="button" className="button secondary" onClick={()=>uploadRef.current?.click()}><ImagePlus size={18}/>Upload Photo</button></div>
    {preview&&file&&<div className="completion-photo-preview"><img src={preview} alt="Completion preview"/><div><strong>{file.name}</strong><small>{Math.max(1,Math.round(file.size/1024))} KB</small><button type="button" onClick={()=>choose()}><X size={15}/>Remove</button></div></div>}
    {file&&<input type="hidden" name="completionPhotoSelected" value="yes"/>}
  </div>;
}
