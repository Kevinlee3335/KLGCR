import {it,expect} from "vitest";
import {inspectionFindings,inspectionRepairKeys,type ABInspection} from "./checkout-inspection";

const record=():ABInspection=>({id:"inspection",room:"A202",b:"A",p:2,date:"2026-11-20",by:"Inspector",reason:"Inspection",
 items:Array.from({length:5},()=>[{enabled:true,status:"good"},{enabled:false,status:"good"}]),
 fac:{"Room Wall":{status:"defect",type:"Other",qty:1,remark:"Stain"},"Bathroom Ceiling":{status:"defect",type:"Water Mark",qty:1}}});

it("shows only the repaired facility as checked and retains the original inspection",()=>{
 const r=record(),original=structuredClone(r),findings=inspectionFindings(r);
 const defects=findings.map((f,i)=>({description:f.description+" ",status:i?"pending":"rectified"}));
 expect(inspectionRepairKeys(r,defects)).toEqual(["a-Room Wall"]);
 expect(r).toEqual(original);
 defects[1].status="rectified";
 expect(inspectionRepairKeys(r,defects)).toEqual(["a-Room Wall","a-Bathroom Ceiling"]);
 defects[0].status="pending";
 expect(inspectionRepairKeys(r,defects)).toEqual(["a-Bathroom Ceiling"]);
});

it("matches furniture by owner and the complete grouped defect description",()=>{
 const r=record();
 r.items[2]=[0,1].map(()=>({enabled:true,status:"defect",defects:[{type:"Broken",qty:1,remark:"Leg"},{type:"Other",qty:1,remark:"Seat"}]}));
 const findings=inspectionFindings(r);
 const defects=findings.map(f=>({description:f.description,status:f.description.includes("UTMSPACE")?"pending":"rectified"}));
 expect(inspectionRepairKeys(r,defects)).toContain("f-2-0");
 expect(inspectionRepairKeys(r,defects)).not.toContain("f-2-1");
 defects.push({...defects[0],status:"pending"});
 expect(inspectionRepairKeys(r,defects)).not.toContain("f-2-0");
});

it("does not infer repair from missing or unrelated defects or older room inspections",()=>{
 const r=record();
 expect(inspectionRepairKeys(r,[])).toEqual([]);
 expect(inspectionRepairKeys(r,[{description:"Bathroom Wall · Other · Qty 1: Stain",status:"rectified"}])).toEqual([]);
 for(const invalid of [null,{},"invalid",{items:null}])expect(inspectionRepairKeys(invalid,[])).toEqual([]);
});
