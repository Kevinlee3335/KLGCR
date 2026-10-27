import { z } from 'zod';
const point=z.tuple([z.number().finite().min(0).max(1),z.number().finite().min(0).max(1)]);
export function isSignaturePng(value:string){
 try{
  if(value.length>180000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return false;
  const bytes=atob(value.slice(22));if(bytes.length<33||[137,80,78,71,13,10,26,10].some((v,i)=>bytes.charCodeAt(i)!==v)||bytes.slice(12,16)!=='IHDR')return false;
  const integer=(i:number)=>Array.from({length:4},(_,j)=>bytes.charCodeAt(i+j)).reduce((n,v)=>n*256+v,0);
  return integer(8)===13&&integer(16)>0&&integer(16)<=1200&&integer(20)>0&&integer(20)<=400;
 }catch{return false;}
}
export const signatureSchema=z.object({strokes:z.array(z.array(point).min(2).max(600)).max(80),imageDataUrl:z.string().max(180000).optional()}).superRefine((v,ctx)=>{
 if(v.imageDataUrl){if(v.strokes.length||!isSignaturePng(v.imageDataUrl))ctx.addIssue({code:'custom',message:'Upload a valid signature PNG.'});}
 else if(!v.strokes.length||v.strokes.reduce((n,s)=>n+s.length,0)>5000)ctx.addIssue({code:'custom',message:'Draw your signature first.'});
});
export type Signature=z.infer<typeof signatureSchema>;
