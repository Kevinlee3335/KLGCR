export type InspectionItem = {enabled?:boolean;confirm?:boolean;qty?:number;status:string;defects?:{type:string;qty:number;remark:string}[];photos?:string[];type?:string;remark?:string};
export type ABInspection = {id:string;room:string;b:string;p:number;date:string;by:string;reason:string;items:InspectionItem[][];fac:Record<string,InspectionItem>};
export function inspectionFindings(record:ABInspection) {
 const findings:{description:string;photos:string[]}[]=[];
 const names=["Divan","Mattress","Chair","Wardrobe","Bookshelf"];
 record.items.forEach((owners,i)=>owners.forEach((item,o)=>{
  if(item.enabled&&item.status==="defect"){
   const detail=(item.defects||[]).map(d=>`${d.type} · Qty ${d.qty}${d.remark?": "+d.remark:""}`).join("; ");
   if(!detail)throw new Error(`Enter the defect for ${names[i]}.`);
   findings.push({description:`${names[i]} · ${o?"UTMSPACE":"KLGCR"} · ${detail}`,photos:item.photos||[]});
  }else if(item.enabled&&item.photos?.length)findings.push({description:"",photos:item.photos});
 }));
 for(const [name,item] of Object.entries(record.fac||{}))if(item.status==="defect"){
  if(!item.type)throw new Error(`Enter the defect for ${name}.`);
  findings.push({description:`${name} · ${item.type} · Qty ${item.qty||1}${item.remark?": "+item.remark:""}`,photos:item.photos||[]});
 }else if(item.photos?.length)findings.push({description:"",photos:item.photos});
 if(findings.reduce((n,f)=>n+f.photos.length,0)>20)throw new Error("Maximum 20 photos per room. Remove extra photos before submitting.");
 return findings;
}
export function isUUID(value:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)}
