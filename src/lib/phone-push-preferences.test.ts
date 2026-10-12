import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ preferences: vi.fn(), subscriptions: vi.fn(), send: vi.fn().mockResolvedValue(undefined) }));
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: mocks.send } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => ({ select: () => ({ in: table === "phone_notification_preferences" ? mocks.preferences : mocks.subscriptions }) }) }) }));
import { sendPushNotifications } from "./push";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("VAPID_PUBLIC_KEY", "key"); vi.stubEnv("VAPID_PRIVATE_KEY", "private"); mocks.subscriptions.mockResolvedValue({data:[{id:"s",endpoint:"endpoint",p256dh:"key",auth:"auth"}],error:null}); });
describe("push preference enforcement", () => {
  it("filters only the intended recipients whose event is enabled", async () => {
    mocks.preferences.mockResolvedValue({data:[{user_id:"off",enabled:true,events:{job_assigned:false}}],error:null});
    await sendPushNotifications({type:"job_assigned",recipientIds:["off","on"],title:"Job",body:"Assigned",href:"/staff"});
    expect(mocks.subscriptions).toHaveBeenCalledWith("user_id", ["on"]);
    expect(mocks.send).toHaveBeenCalledOnce();
  });
  it("never queries subscriptions when all intended recipients disabled phone notifications", async () => {
    mocks.preferences.mockResolvedValue({data:[{user_id:"off",enabled:false,events:{}}],error:null});
    await sendPushNotifications({type:"job_assigned",recipientIds:["off"],title:"Job",body:"Assigned",href:"/staff"});
    expect(mocks.subscriptions).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not bypass saved settings on a transient preference query error", async () => {
    mocks.preferences.mockResolvedValue({data:null,error:{code:"XX000"}});vi.spyOn(console,"error").mockImplementation(()=>{});
    await sendPushNotifications({type:"job_assigned",recipientIds:["off"],title:"Job",body:"Assigned",href:"/staff"});
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
