import { expect, it } from "vitest";
import { materialLineStatus, materialRequestLabel } from "./material-request-state";
const pending={requested_qty:1,approved_qty:null,issued_qty:0};
const approved={...pending,approved_qty:1};
const issued={...approved,issued_qty:1};
it("prioritizes explicit item rejection and cancellation over previous approval",()=>{
  expect(materialLineStatus({...approved,line_status:"cancelled"})).toBe("Cancelled");
  expect(materialLineStatus({...pending,line_status:"rejected"})).toBe("Rejected");
});
it("excludes closed lines from pending and partially approved labels",()=>{
  expect(materialRequestLabel("approved",[{...pending,line_status:"rejected"},approved])).toBe("Approved");
  expect(materialRequestLabel("issued",[{...approved,line_status:"cancelled"},issued])).toBe("Issued");
  expect(materialRequestLabel("pending",[pending,approved])).toBe("Partially Approved");
});
it("labels cancelled or mixed closed requests without implying that anything was issued",()=>{
  expect(materialRequestLabel("rejected",[{...approved,line_status:"cancelled"}])).toBe("Cancelled");
  expect(materialRequestLabel("rejected",[{...pending,line_status:"rejected"},{...approved,line_status:"cancelled"}])).toBe("Closed");
});
