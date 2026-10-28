// Process locally: keep the original file out of storage and save only the reviewed signature.
export async function prepareSignaturePhoto(file:File):Promise<string>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Choose a PNG, JPG or WebP image up to 5 MB.');
 const url=URL.createObjectURL(file),image=new Image();
 try{
  await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('Unable to open this image.'));image.src=url;});
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>20000000)throw Error('Please crop the photo closer to your signature.');
  const scale=Math.min(1,1500/image.naturalWidth,1500/image.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Unable to prepare this image.');ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);let left=canvas.width,top=canvas.height,right=0,bottom=0,ink=0;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
   const i=(y*canvas.width+x)*4,min=Math.min(pixels.data[i],pixels.data[i+1],pixels.data[i+2]);
   if(min>235)pixels.data[i+3]=0;
   if(pixels.data[i+3]>30&&min<210){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);ink++;}
  }
  if(ink<12)throw Error('No signature found. Please upload a clear close-up.');ctx.putImageData(pixels,0,0);
  const padding=8;left=Math.max(0,left-padding);top=Math.max(0,top-padding);right=Math.min(canvas.width-1,right+padding);bottom=Math.min(canvas.height-1,bottom+padding);
  const output=document.createElement('canvas');output.width=900;output.height=270;const target=output.getContext('2d');if(!target)throw Error('Unable to prepare this image.');
  const width=right-left+1,height=bottom-top+1,fit=Math.min(860/width,230/height);target.drawImage(canvas,left,top,width,height,(900-width*fit)/2,(270-height*fit)/2,width*fit,height*fit);
  const data=output.toDataURL('image/png');if(data.length>180000)throw Error('Please use a clearer close-up with a plain white background.');return data;
 }finally{URL.revokeObjectURL(url);}
}
