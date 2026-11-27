// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { streamPage } from "@/test/stream-page";
import Page from "./page";

const database = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({requireRole: async () => ({ id: "cleaner", role: "cleaner" })}));
vi.mock("@/lib/supabase/server", () => ({createClient: database}));
vi.mock("@/components/app-shell", () => ({AppShell: ({children}: {children: React.ReactNode}) => <main>{children}</main>}));
it("opens the month controls before entries and retains month-end, staff-scoped recurring and one-time work", async () => {
  const requests = new Map<string, URLSearchParams>();
  let finish!: () => void;
  database.mockResolvedValue(createClient("https://calendar.example","test", {global:{fetch: async input => {
    const url = new URL(String(input)), table = url.pathname.split("/").at(-1)!;
    requests.set(table,url.searchParams);
    if (table === "recurring_daily_tasks") await new Promise<void>(resolve => { finish = resolve; });
    const rows = table === "recurring_daily_tasks" ? [{id:"rec", title:"Monthly fixture", frequency:"monthly", day_number:31,starts_on:"2026-02-01"}]
      : table === "admin_daily_tasks" ? [{id:1, task_date:"2026-02-28",title:"Fixture one-time task",status:"accepted"}]
      : table === "calendar_events" ? [{id:"event",title:"Last-day meeting",starts_at:"2026-02-28T02:00:00Z",ends_at:"2028-01-01T00:00:00Z",event_type:"meeting"}]
      : [];
    return Response.json(rows);
  }}}));
  const page = streamPage(await Page({searchParams:Promise.resolve({month:"2026-02"})}));
  try {
    await vi.waitFor(() => expect(page.html()).toContain('href="?month=2026-03"'));
    expect(page.html()).toContain("Loading calendar entries");
    expect(page.html()).not.toContain("Monthly fixture");
    finish();
    await vi.waitFor(() => expect(page.html()).toContain("Monthly fixture"));
    expect(page.html()).toContain("/staff/daily-tasks?date=2026-02-28");
    expect(page.html()).toContain("Fixture one-time task");
    expect(page.html()).toContain("Last-day meeting");
    const daily = requests.get("admin_daily_tasks")!;
    expect(daily.get("assigned_to")).toBe("eq.cleaner");
    expect(daily.get("recurrence_id")).toBe("is.null");
    expect(daily.get("calendar_event_id")).toBe("is.null");
    expect(requests.get("recurring_daily_tasks")?.get("assigned_to")).toBe("eq.cleaner");
    expect(page.errors).toEqual([]);
  } finally { page.close(); }
});
