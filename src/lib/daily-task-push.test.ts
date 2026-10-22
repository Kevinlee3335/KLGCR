import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({push:vi.fn(),insert:vi.fn(),profile:vi.fn()}));
vi.mock("./push",()=>({sendPushNotifications:mocks.push}));
vi.mock("./supabase/admin",()=>({createAdminClient:()=>({from:(table:string)=>{
  if(table === "app_notifications")return {insert:mocks.insert};
  const query={select:()=>query,in:()=>({eq:async()=>({data:[],error:null})}),eq:()=>query,is:()=>query,maybeSingle:mocks.profile};return query;
}})}));
import { notifyDailyTaskAssigned } from "./daily-task-notifications";
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.profile.mockResolvedValue({data:{role:"cleaner"},error:null});
  mocks.insert.mockResolvedValue({error:null});
});
it.each([false,true])("writes an assignment alert and sends phone Push (repeating=%s)",async(repeating)=>{
  await notifyDailyTaskAssigned({recipientId:"nancy",title:"Clean lobby",date:"2026-10-14",category:"housekeeping",repeating});
  expect(mocks.insert).toHaveBeenCalledWith([expect.objectContaining({recipient_id:"nancy",type:"daily_task_assigned",entity_id:null})]);
  expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({recipientIds:["nancy"],href:"/staff/daily-tasks"}));
});
