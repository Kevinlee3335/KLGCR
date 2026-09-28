import { describe,it,expect,vi } from "vitest";
const mocks=vi.hoisted(()=>({push:vi.fn().mockResolvedValue(undefined),email:vi.fn(),insert:vi.fn().mockResolvedValue({error:null})}));
vi.mock("./push",()=>({sendPushNotifications:mocks.push}));
vi.mock("./email",()=>({sendTransactionalEmail:mocks.email}));
vi.mock("./supabase/admin",()=>({createAdminClient:()=>({from:(table:string)=>{
  if(table==="app_notifications")return {insert:mocks.insert};
  const query={select:()=>query,in:()=>query,eq:()=>query,is:()=>Promise.resolve({data:[{id:"staff-1"}],error:null})};return query;
}})}));
import { notifyMaterialRequestRecipients } from "./app-notifications";
describe("material notification channel",()=>{
  it("keeps app and phone notifications without sending MR email",async()=>{
    await notifyMaterialRequestRecipients({recipientIds:["staff-1"],type:"material_request",title:"Material approved",body:"Approved",href:"/staff/material-request"});
    expect(mocks.insert).toHaveBeenCalledOnce();expect(mocks.push).toHaveBeenCalledOnce();expect(mocks.email).not.toHaveBeenCalled();
  });
});
