import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MaterialLineActions } from "./material-line-actions";

const row={id:"line-1",inventory_item_id:"stock-1",requested_qty:1,approved_qty:null as number|null,issued_qty:0,line_status:"active",item:{description:"PVC 20mm",balance_qty:9}};
it("offers rejection for one pending line with the expected values",()=>{
  render(<MaterialLineActions requestId="request-1" row={row}/>);
  expect(screen.getByText("Reject Item")).toBeInTheDocument();
  expect(screen.queryByText("Cancel Approval")).toBeNull();
  const form=screen.getByRole("button",{name:"Confirm Rejection",hidden:true}).closest("form")!;
  expect(Object.fromEntries(new FormData(form))).toEqual({requestId:"request-1",requestItemId:"line-1",action:"reject_item",expectedInventoryItemId:"stock-1",expectedRequestedQty:"1",expectedApprovedQty:"",reason:""});
});
it("offers cancellation and editing before an approved line is issued",()=>{
  render(<MaterialLineActions requestId="request-1" row={{...row,approved_qty:1}}/>);
  expect(screen.getByText("Cancel Approval")).toBeInTheDocument();
  expect(screen.getByRole("button",{name:/Edit Material/})).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Issue Item"})).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Approve"})).toBeNull();
});
it.each(["rejected","cancelled"])("hides actions on %s lines even if they retain their approval",line_status=>{
  const {container}=render(<MaterialLineActions requestId="request-1" row={{...row,approved_qty:1,line_status}}/>);
  expect(container).toBeEmptyDOMElement();
});
it("preserves issuing a remaining quantity but never edits a partially issued line",()=>{
  render(<MaterialLineActions requestId="request-1" row={{...row,approved_qty:2,issued_qty:1}}/>);
  expect(screen.getByRole("button",{name:"Issue Item"})).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:/Edit Material/})).toBeNull();
  expect(screen.queryByText("Cancel Approval")).toBeNull();
});
