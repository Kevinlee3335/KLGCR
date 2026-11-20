import catalog from "./checkout-cd-catalog.json";

export type CDInspection = {
 id:string;b:string;l:string|number;room:string|number;t:number;round:number;
 date:string;by:string;reason:string;it:Record<string,number>;
 nt:Record<string,string>;ph?:Record<string,string[]>;
};
type Category=[string,[string,number[],number[],(string|string[])?][]];
export const CD_CATEGORIES=catalog.categories as Category[];
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
 CD_CATEGORIES.forEach(([category,items],ci)=>{
  const photos=record.ph?.[ci]||[];
  if(!Array.isArray(photos)||photos.some(p=>typeof p!=="string"))throw new Error("Invalid inspection photos.");
  let attached=false;
  items.forEach(([name],si)=>{
   const qty=record.it[`${ci}.${si}`];
   if(!Number.isInteger(qty)||qty<0||qty>99)throw new Error("Please check every item before submitting.");
   if(qty>0){
    const remark=record.nt[ci]||"";
    if(typeof remark!=="string"||remark.length>1500)throw new Error("Inspection remarks are too long.");
    findings.push({description:`${category} · ${name} · Qty ${qty}${remark?": "+remark:""}`,photos:attached?[]:photos});
    attached=true;
   }
  });
  if(!attached&&photos.length)findings.push({description:"",photos});
 });
 if(findings.reduce((n,f)=>n+f.photos.length,0)>20)throw new Error("Maximum 20 photos per room. Remove extra photos before submitting.");
 return findings;
}
