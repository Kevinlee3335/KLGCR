import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/membership-form",()=>({MembershipForm:()=> <div data-testid="registration-form"/>}));
vi.mock("@/lib/membership",()=>({membershipEnabled:()=>false,receiptOptionalForTesting:()=>true}));
import Page from "./page";
afterEach(cleanup);
describe("membership entrance",()=>{
  it("opens with three choices and no registration form",async()=>{
    render(await Page({searchParams:Promise.resolve({})}));
    expect(screen.getByRole("link",{name:/New Registration/})).toHaveAttribute("href","/membership/register?action=new");
    expect(screen.getByRole("link",{name:/Renew Membership/})).toHaveAttribute("href","/membership/register?action=renew");
    expect(screen.getByRole("link",{name:/Cancel Membership/})).toHaveAttribute("href","/membership/register?action=cancel");
    expect(screen.queryByTestId("registration-form")).toBeNull();
  });
  it("only shows registration after choosing New Registration",async()=>{
    render(await Page({searchParams:Promise.resolve({action:"new"})}));
    expect(screen.getByTestId("registration-form")).toBeInTheDocument();
    expect(screen.getByRole("link",{name:/Membership options/})).toBeInTheDocument();
  });
  it.each(["renew","cancel"])("opens the secure existing-member flow for %s",async action=>{
    render(await Page({searchParams:Promise.resolve({action})}));
    expect(screen.getByRole("textbox",{name:"Your private membership link"})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:action==="renew"?"Continue to Renewal":"Continue to Cancellation"})).toBeInTheDocument();
    expect(screen.queryByTestId("registration-form")).toBeNull();
  });
});
