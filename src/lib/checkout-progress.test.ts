import {describe,it,expect} from "vitest";
import {checkoutProgress} from "./checkouts";
describe("check-out repair progress",()=>{
 it("excludes legacy No Defect markers without deleting them",()=>expect(checkoutProgress([{description:"No Defect",status:"open"}])).toEqual({total:0,completed:0,remaining:0,percent:100}));
 it("keeps partially completed rooms in rectification",()=>expect(checkoutProgress([{description:"Fan",status:"rectified"},{description:"Tap",status:"open"},{description:"No defects",status:"open"}])).toEqual({total:2,completed:1,remaining:1,percent:50}));
 it("only finishes after every real repair",()=>expect(checkoutProgress([{description:"Fan",status:"rectified"},{description:"Tap",status:"rectified"}]).remaining).toBe(0));
 it("handles zero and rounded progress",()=>{expect(checkoutProgress([]).percent).toBe(100);expect(checkoutProgress([{description:"a",status:"rectified"},{description:"b",status:"open"},{description:"c",status:"open"}]).percent).toBe(33)});
});
