'use client';
import {useRef,useState} from 'react';
import {Camera,Upload} from 'lucide-react';
export function CheckoutPhotoInput({id}:{id?:string}){
 const input=useRef<HTMLInputElement>(null);const [filename,setFilename]=useState('');
 function choose(camera:boolean){const element=input.current;if(!element)return;if(camera)element.setAttribute('capture','environment');else element.removeAttribute('capture');element.click();}
 return <div className="checkout-photo-input"><div className="checkout-photo-tools"><button type="button" className="button" onClick={()=>choose(true)}><Camera size={18} aria-hidden="true"/>Take Photo</button><button type="button" className="button secondary" onClick={()=>choose(false)}><Upload size={18} aria-hidden="true"/>Upload Photo</button></div><input id={id} ref={input} className="checkout-photo-native" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required aria-label="Completion photo" onChange={event=>setFilename(event.currentTarget.files?.[0]?.name||'')}/><small className="subtle" role="status">{filename||'Take a photo or choose one from your gallery.'}</small></div>;
}
