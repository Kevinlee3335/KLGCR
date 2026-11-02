import {PNG} from 'pdf-lib/cjs/utils/png';

export function signaturePhotoBounds(dataUrl:string){
 const bytes=Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',')+1)),c=>c.charCodeAt(0));
 const png=PNG.load(bytes);
 let left=png.width,top=png.height,right=-1,bottom=-1;
 for(let y=0;y<png.height;y++){
   for(let x=0;x<png.width;x++){
     const i=y*png.width+x;
     const alpha=png.alphaChannel?.[i]??255;
     if(alpha>30&&Math.min(png.rgbChannel[i*3],png.rgbChannel[i*3+1],png.rgbChannel[i*3+2])<210){
       left=Math.min(left,x);right=Math.max(right,x);
       top=Math.min(top,y);bottom=Math.max(bottom,y);
     }
   }
 }
 if(right<left)return {left:0,top:0,width:png.width,height:png.height,imageWidth:png.width,imageHeight:png.height};
 return {left,top,width:right-left+1,height:bottom-top+1,imageWidth:png.width,imageHeight:png.height};
}
