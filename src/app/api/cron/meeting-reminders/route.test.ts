import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ notify: vi.fn(), from: vi.fn(), queries: [] as string[] }));
vi.mock("@/lib/app-notifications", () => ({ createAppNotifications: mocks.notify }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
import { GET } from "./route";
describe("meeting reminders", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-16T09:00:00+08:00"));
    vi.stubEnv("CRON_SECRET", "test"); mocks.notify.mockReset(); mocks.from.mockReset();
    mocks.from.mockImplementation((table: string) => {
      const data = table === "calendar_events" ? [
        { id: "meeting", title: "Operations", notes: "Room", starts_at: "2026-10-16T16:30:00+08:00", audience: "individual", assigned_to: "kevin" },
        { id: "expired", title: "Old", starts_at: "2026-10-16T08:00:00+08:00", audience: "all_staff" },
      ] : table === "profiles" ? [{id:"kevin",role:"admin"},{id:"faiz",role:"maintenance_staff"}] : [];
      const query = { select:()=>query, eq:()=>query, gt:()=>query, lte:()=>query, is:()=>query, gte:()=>query,
        then: (resolve: (value:unknown)=>unknown) => Promise.resolve({data,error:null}).then(resolve) };
      return query;
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  const request = () => new Request("https://example.com/api/cron/meeting-reminders", {headers:{authorization:"Bearer test"}}) as never;
  it("notifies only meeting participants and sets expiry to meeting start", async () => {
    expect((await GET(request())).status).toBe(200);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({recipientIds:["kevin"],entityId:"meeting",expiresAt:"2026-10-16T16:30:00+08:00",href:"/admin/calendar"}));
  });
  it("rejects unauthenticated requests", async () => {
    expect((await GET(new Request("https://example.com") as never)).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not send catch-up notifications between scheduled hours", async () => {
    vi.setSystemTime(new Date("2026-10-16T14:00:00+08:00"));
    await GET(request()); expect(mocks.notify).not.toHaveBeenCalled();
  });
});
