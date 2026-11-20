export type InspectionItem = {enabled?:boolean;confirm?:boolean;qty?:number;status:string;defects?:{type:string;qty:number;remark:string}[];photos?:string[];type?:string;remark?:string};
export type ABInspection = {id:string;room:string;b:string;p:number;date:string;by:string;reason:string;items:InspectionItem[][];fac:Record<string,InspectionItem>};
const FURNITURE_NAMES=["Divan","Mattress","Chair","Wardrobe","Bookshelf"];
function furnitureDescription(item:InspectionItem,i:number,o:number){
 const detail=(item.defects||[]).map(d=>`${d.type} · Qty ${d.qty}${d.remark?": "+d.remark:""}`).join("; ");
 return detail?`${FURNITURE_NAMES[i]} · ${o?"UTMSPACE":"KLGCR"} · ${detail}`:"";
}
function facilityDescription(name:string,item:InspectionItem){
 return `${name} · ${item.type} · Qty ${item.qty||1}${item.remark?": "+item.remark:""}`;
}
// Repair state belongs to this inspection's defect rows, never just its room status.
// Return display keys without changing the original inspection or evidence.
export function inspectionRepairKeys(checklist:unknown,defects:{description:string;status:string}[]){
 if(!checklist||typeof checklist!=="object")return [];
 const record=checklist as Partial<ABInspection>;
 if(!Array.isArray(record.items))return [];
 const repaired=(description:string)=>{
  const matches=defects.filter(d=>d.description.trim()===description.trim());
  return !!description&&matches.length>0&&matches.every(d=>d.status==="rectified");
 };
 const keys:string[]=[];
 record.items.forEach((owners,i)=>{if(Array.isArray(owners))owners.forEach((item,o)=>{
  if(item?.enabled&&item.status==="defect"&&repaired(furnitureDescription(item,i,o)))keys.push(`f-${i}-${o}`);
 })});
 for(const [name,item] of Object.entries(record.fac||{})){
  if(item?.status==="defect"&&item.type&&repaired(facilityDescription(name,item)))keys.push(`a-${name}`);
 }
 return keys;
}
export function inspectionFindings(record:ABInspection) {
 const findings:{description:string;photos:string[]}[]=[];
 const names=["Divan","Mattress","Chair","Wardrobe","Bookshelf"];
 record.items.forEach((owners,i)=>owners.forEach((item,o)=>{
  if(item.enabled&&item.status==="defect"){
   const description=furnitureDescription(item,i,o);
   if(!description)throw new Error(`Enter the defect for ${names[i]}.`);
   findings.push({description,photos:item.photos||[]});
  }else if(item.enabled&&item.photos?.length)findings.push({description:"",photos:item.photos});
 }));
 for(const [name,item] of Object.entries(record.fac||{}))if(item.status==="defect"){
  if(!item.type)throw new Error(`Enter the defect for ${name}.`);
  findings.push({description:facilityDescription(name,item),photos:item.photos||[]});
 }else if(item.photos?.length)findings.push({description:"",photos:item.photos});
 if(findings.reduce((n,f)=>n+f.photos.length,0)>20)throw new Error("Maximum 20 photos per room. Remove extra photos before submitting.");
 return findings;
}
export function isUUID(value:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)}
