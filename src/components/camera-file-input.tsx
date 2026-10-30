"use client";
import { useRef, type ComponentProps } from "react";
import { Camera } from "lucide-react";

/** Camera companion for existing single-purpose file fields (receipts, signatures, meter readings). */
export function CameraFileInput({ref: forwardedRef, ...props}: ComponentProps<"input">) {
 const input=useRef<HTMLInputElement|null>(null);
 const camera=useRef<HTMLInputElement|null>(null);
 function setRef(element:HTMLInputElement|null){
  input.current=element;
  if(typeof forwardedRef==='function')forwardedRef(element);
  else if(forwardedRef)(forwardedRef as {current:HTMLInputElement|null}).current=element;
 }
 return <><input {...props} type="file" ref={setRef}/><span style={{display:"inline-flex",gap:8,marginTop:8}}><button type="button" className="button secondary" disabled={props.disabled} onClick={event=>{event.preventDefault();event.stopPropagation();camera.current?.click();}}><Camera size={18} aria-hidden="true"/>Take Photo</button><input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label={`Take photo for ${props['aria-label']||props.name||'attachment'}`} disabled={props.disabled} hidden onChange={event=>{
  const files=event.currentTarget.files;
  if(files?.length&&input.current){
   const transfer=new DataTransfer();
   const combined=props.multiple?[...Array.from(input.current.files||[]),...Array.from(files)]:Array.from(files);
   if(combined.length>20){input.current.setCustomValidity("Maximum 20 photos.");input.current.reportValidity();event.currentTarget.value="";return;}
   input.current.setCustomValidity("");
   for(const file of combined)transfer.items.add(file);
   input.current.files=transfer.files;
   input.current.dispatchEvent(new Event('change',{bubbles:true}));
  }
  event.currentTarget.value='';
 }}/></span></>;
}
