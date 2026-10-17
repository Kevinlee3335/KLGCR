import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const actions = vi.hoisted(()=>({registerMember:vi.fn(),submitMemberRequest:vi.fn()}));
vi.mock("@/app/membership/actions",()=>actions);
import { MembershipForm } from "./membership-form";
it("lets preview users test without a receipt and clearly reports that nothing was saved",()=>{
 const {container}=render(<MembershipForm submissionEnabled={false} receiptOptional/>);
 fireEvent.change(screen.getByLabelText("Full name"),{target:{value:"Test Student"}});
 fireEvent.change(screen.getByLabelText("Room number"),{target:{value:"A421"}});
 const button=screen.getByRole("button",{name:"Test registration"});
 expect(button).toBeEnabled();
 fireEvent.submit(container.querySelector("form")!);
 expect(screen.getByRole("status")).toHaveTextContent("Test Student · A421 · RM40");
 expect(screen.getByRole("status")).toHaveTextContent("No application has been saved");
 expect(actions.registerMember).not.toHaveBeenCalled();
});
it("shows a chosen file and rejects oversized files before submission",()=>{
 render(<MembershipForm submissionEnabled={false} receiptOptional/>);
 const input=screen.getByLabelText(/Payment receipt/);
 fireEvent.change(input,{target:{files:[new File(["receipt"],"receipt.pdf",{type:"application/pdf"})]}});
 expect(screen.getByText("receipt.pdf")).toBeInTheDocument();
 fireEvent.change(input,{target:{files:[new File([new Uint8Array(3*1024*1024+1)],"oversized.pdf",{type:"application/pdf"})]}});
 expect(screen.getByRole("alert")).toHaveTextContent("up to 3 MB");
});
