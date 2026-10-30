import {describe,it,expect} from "vitest";
import {inspectionFindings,type ABInspection} from "./checkout-inspection";
const record=():ABInspection=>({id:"test",room:"A203",b:"A",p:2,date:"2026-10-30",by:"Kevin",reason:"Inspection",items:Array.from({length:5},()=>[{enabled:true,status:"good",photos:[]},{enabled:false,status:"good",photos:[]}]),fac:{Fan:{status:"good"}}});
describe("AB inspection conversion",()=>{
 it("creates no repair defects when everything is Good",()=>expect(inspectionFindings(record())).toEqual([]));
 it("keeps each defect's notes and all seven photos attached to that defect",()=>{
  const r=record();r.fac.Fan={status:"defect",type:"Broken",qty:1,remark:"Fan stopped",photos:Array.from({length:7},(_,i)=>"photo"+i)};
  r.items[0][0]={enabled:true,status:"defect",defects:[{type:"Missing",qty:1,remark:"Bed absent"}],photos:["bed"]};
  const findings=inspectionFindings(r);expect(findings).toHaveLength(2);expect(findings[0].description).toContain("Bed absent");expect(findings[1].photos).toHaveLength(7);expect(findings[1].description).toContain("Fan stopped");
 });
 it("limits the whole room to 20 photos",()=>{const r=record();r.fac.Fan={status:"defect",type:"Broken",photos:Array(21).fill("photo")};expect(()=>inspectionFindings(r)).toThrow("Maximum 20")});
});
