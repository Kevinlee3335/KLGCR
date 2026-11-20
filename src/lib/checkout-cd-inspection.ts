import catalog from "./checkout-cd-catalog.json";

export type CDInspection = {
 id:string;b:string;l:string|number;room:string|number;t:number;round:number;
 date:string;by:string;reason:string;it:Record<string,number>;
 nt:Record<string,string>;ph?:Record<string,string[]>;
 schemaVersion?:2;dt?:Record<string,{type:string;remark:string}>;
};
type Category=[string,[string,number[],number[],(string|string[])?][]];
export const CD_CATEGORIES=catalog.categories as Category[];
export const CD_DEFECT_TYPES=["Broken","Missing","Not Working","Leaking","Moldy","Water Mark","Loose","Cannot Lock","Cannot Open / Close","Dirty","Blocked","Other"];
export function cdItemDescription(record:CDInspection,ci:number,si:number){
 const key=`${ci}.${si}`,qty=record.it[key];
 if(!qty)return "";
 const detail=record.dt?.[key],remark=detail?.remark??record.nt?.[ci]??"";
 return `${CD_CATEGORIES[ci][0]} · ${CD_CATEGORIES[ci][1][si][0]}${detail?" · "+detail.type:""} · Qty ${qty}${remark?": "+remark:""}`;
}
export function cdInspectionRepairKeys(record:CDInspection,defects:{description:string;status:string}[]){
 if(!record.it)return [];
 return CD_CATEGORIES.flatMap(([,items],ci)=>items.flatMap((_,si)=>{
  const description=cdItemDescription(record,ci,si);
  const matches=description?defects.filter(d=>d.description.trim()===description.trim()):[];
  return matches.length&&matches.every(d=>d.status==="rectified")?[`cd-${ci}.${si}`]:[];
 }));
}
// Category photos from older inspections and item photos share the same private upload flow.
export function cdUploadedPhotoGroups(record:CDInspection,images:{url:string}[],paths:string[]){
 const available=new Map<string,string[]>();
 images.forEach((image,i)=>available.set(image.url,[...(available.get(image.url)||[]),paths[i]]));
 return Object.fromEntries(Object.entries(record.ph||{}).map(([key,photos])=>[key,photos.map(photo=>{
  const path=available.get(photo)?.shift();
  if(!path)throw new Error("Inspection photo mapping failed. Please retry.");
  return path;
 })]));
}
export function cdRoomPax(block:string,room:string):number|null {
 const levels=(catalog.rooms as Record<string,Record<string,string>>)[block];
 if(!levels||!/^\d{3}$/.test(room))return null;
 for(const entry of (levels[room[0]]||"").split(",")){
  const [range,pax]=entry.split(":"),[first,last]=range.split("-").map(Number);
  if(+room>=first&&+room<=last)return +pax;
 }
 return null;
}
export function cdInspectionFindings(record:CDInspection){
 if(!record||cdRoomPax(record.b,String(record.room))!==record.t||!record.by?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(record.date)||!record.it||!record.nt)
  throw new Error("Invalid C/D inspection. Check the room, inspector and date.");
 const findings:{description:string;photos:string[]}[]=[];
 const keys=new Set(CD_CATEGORIES.flatMap(([,items],ci)=>[String(ci),...items.map((_,si)=>`${ci}.${si}`)]));
 for(const [key,photos] of Object.entries(record.ph||{}))if(!keys.has(key)||!Array.isArray(photos)||photos.some(p=>typeof p!=="string"))throw new Error("Invalid inspection photos.");
 CD_CATEGORIES.forEach(([,items],ci)=>{
  const photos=record.ph?.[ci]||[];
  let attached=false;
  items.forEach((_,si)=>{
   const key=`${ci}.${si}`,qty=record.it[key];
   if(!Number.isInteger(qty)||qty<0||qty>99)throw new Error("Please check every item before submitting.");
   const itemPhotos=record.ph?.[key]||[];
   if(qty>0){
    const detail=record.dt?.[key];
    if(record.schemaVersion===2&&(!detail||!CD_DEFECT_TYPES.includes(detail.type)))throw new Error("Select a defect type for every faulty item.");
    const remark=detail?.remark??record.nt[ci]??"";
    if(typeof remark!=="string"||remark.length>1500)throw new Error("Inspection remarks are too long.");
    if(detail?.type==="Other"&&!remark.trim())throw new Error("Other requires a remark.");
    findings.push({description:cdItemDescription(record,ci,si),photos:[...itemPhotos,...(attached?[]:photos)]});
    attached=true;
   }else if(itemPhotos.length)findings.push({description:"",photos:itemPhotos});
  });
  if(!attached&&photos.length)findings.push({description:"",photos});
 });
 if(findings.reduce((n,f)=>n+f.photos.length,0)>20)throw new Error("Maximum 20 photos per room. Remove extra photos before submitting.");
 return findings;
}
