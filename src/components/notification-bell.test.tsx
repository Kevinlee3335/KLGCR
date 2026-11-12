import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "./notification-bell";
import { DashboardNotificationSession } from "./notification-session";

const removeChannel = vi.fn().mockResolvedValue(undefined);
const state = vi.hoisted(() => ({
  items: [] as Array<{id:string;title:string;body:string;href:string;created_at:string;read_at:null}>,
  load: vi.fn(),
  update: vi.fn(),
  channel: vi.fn(),
  insert: new Map<string, (event: {new: unknown}) => void>(),
  subscribe: new Map<string, (status: string) => void>(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: (column: string, userId: string) => ({ order: () => ({ limit: async () => {
        return { data: await (state.load(column, userId) ?? state.items) };
      } }) }) }),
      update: () => ({ in: () => ({ eq: (...args: unknown[]) => state.update(...args) }) }),
    }),
    channel: (name: string) => {
      state.channel(name);
      return { on: (_event: string, _filter: unknown, callback: (event: {new: unknown}) => void) => {
        state.insert.set(name, callback);
        return { subscribe: (callback: (status: string) => void) => {
          state.subscribe.set(name, callback);
          return { name };
        } };
      } };
    },
    removeChannel,
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  state.items = [];
  state.insert.clear();
  state.subscribe.clear();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("notification read persistence", () => {
  it("keeps notifications unread after a failed write, then permits retry", async () => {
    state.items = [{id:"n1",title:"Task assigned",body:"Pump check",href:"/staff",created_at:"2026-10-12T01:00:00Z",read_at:null}];
    state.update.mockResolvedValueOnce({error:{message:"offline"}}).mockResolvedValueOnce({error:null});
    render(<NotificationBell userId="staff-read-test"/>);
    fireEvent.click(screen.getByRole("button",{name:"Open notifications"}));
    await screen.findByText("Task assigned");
    const button = screen.getByRole("button",{name:"Mark all read"});
    fireEvent.click(button);
    await screen.findByRole("alert");
    expect(screen.getByText("Task assigned").closest("a")).toHaveClass("unread");
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    await waitFor(()=>expect(button).toBeDisabled());
    expect(screen.getByText("Task assigned").closest("a")).not.toHaveClass("unread");
    expect(state.update).toHaveBeenCalledWith("recipient_id","staff-read-test");
  });

  it("shares an in-progress load when focus and visibility change together", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => {
      render(<NotificationBell userId="staff-refresh-test"/>);
    });
    expect(state.load).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent(document, new Event("visibilitychange"));
      fireEvent(window, new Event("focus"));
    });
    expect(state.load).toHaveBeenCalledTimes(2);
  });
});

describe("notification session during dashboard navigation", () => {
  const route = (page: string, userId: string) =>
    <DashboardNotificationSession><section key={page}><NotificationBell userId={userId}/></section></DashboardNotificationSession>;
  const notice = (id: string, title: string) => ({
    id, title, body: "Task updated", href: "/staff", created_at: "2026-11-12T01:00:00Z", read_at: null,
  });

  it("keeps a single notification query and channel while remounting the bell on a new page", async () => {
    state.items = [notice("first", "Initial notification")];
    const view = render(route("Dashboard", "staff-navigation"));
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    await screen.findByText("Initial notification");

    act(() => state.insert.get("notifications-staff-navigation")?.({ new: notice("later", "Realtime notification") }));
    await screen.findByText("Realtime notification");
    view.rerender(route("Check-out Rooms", "staff-navigation"));
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    expect(screen.getByText("Realtime notification")).toBeInTheDocument();
    expect(state.load).toHaveBeenCalledExactlyOnceWith("recipient_id", "staff-navigation");
    expect(state.channel).toHaveBeenCalledExactlyOnceWith("notifications-staff-navigation");
    expect(removeChannel).not.toHaveBeenCalled();

    view.unmount();
    expect(removeChannel).toHaveBeenCalledExactlyOnceWith({ name: "notifications-staff-navigation" });
  });

  it("replaces the session when the account changes and ignores late updates from the old account", async () => {
    state.items = [notice("old", "Old account notification")];
    const view = render(route("Dashboard", "staff-old"));
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    await screen.findByText("Old account notification");

    state.items = [notice("new", "New account notification")];
    view.rerender(route("Dashboard", "staff-new"));
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    expect(screen.queryByText("Old account notification")).not.toBeInTheDocument();
    await screen.findByText("New account notification");
    act(() => state.insert.get("notifications-staff-old")?.({ new: notice("late", "Old account late update") }));
    expect(screen.queryByText("Old account late update")).not.toBeInTheDocument();
    expect(state.load).toHaveBeenLastCalledWith("recipient_id", "staff-new");
    expect(removeChannel).toHaveBeenCalledExactlyOnceWith({ name: "notifications-staff-old" });
  });

  it("refreshes the notification list when realtime reconnects", async () => {
    state.items = [notice("first", "Initial notification")];
    render(route("Dashboard", "staff-reconnect"));
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    await screen.findByText("Initial notification");
    const subscribe = state.subscribe.get("notifications-staff-reconnect");
    act(() => subscribe?.("SUBSCRIBED"));
    expect(state.load).toHaveBeenCalledTimes(1);

    state.items = [notice("first", "Initial notification"), notice("missed", "Missed while offline")];
    act(() => subscribe?.("SUBSCRIBED"));
    await screen.findByText("Missed while offline");
    expect(state.load).toHaveBeenCalledTimes(2);
  });

  it("preserves realtime inserts and successful read changes when an older list response arrives", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const initial = notice("first", "Initial notification");
    state.items = [initial];
    state.update.mockResolvedValueOnce({ error: null });
    render(route("Dashboard", "staff-in-flight"));
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    await screen.findByText("Initial notification");

    let completeRefresh: (rows: typeof state.items) => void = () => {};
    state.load.mockReturnValueOnce(new Promise<typeof state.items>((resolve) => { completeRefresh = resolve; }));
    fireEvent(window, new Event("focus"));
    act(() => state.insert.get("notifications-staff-in-flight")?.({ new: notice("second", "Realtime notification") }));
    await screen.findByText("Realtime notification");
    const button = screen.getByRole("button", { name: "Mark all read" });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());

    await act(async () => completeRefresh([initial]));
    expect(screen.getByText("Realtime notification").closest("a")).not.toHaveClass("unread");
    expect(screen.getByText("Initial notification").closest("a")).not.toHaveClass("unread");
    expect(state.load).toHaveBeenCalledTimes(2);
  });

  it("drops delayed phone alerts from the old account and handles rejected device notifications", async () => {
    vi.stubGlobal("Notification", { permission: "granted" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const showNotification = vi.fn().mockRejectedValue(new Error("Device rejected notification"));
    const registration = {
      active: { scriptURL: new URL("/sw.js", window.location.origin).href },
      pushManager: { getSubscription: vi.fn().mockResolvedValue({ endpoint: "https://push.example/device-swap" }) },
      showNotification,
    };
    let finishReady: (value: typeof registration) => void = () => {};
    const ready = new Promise<typeof registration>((resolve) => { finishReady = resolve; });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: vi.fn().mockResolvedValue(registration), ready } });
    const view = render(route("Dashboard", "staff-alert-old"));
    act(() => state.insert.get("notifications-staff-alert-old")?.({ new: notice("old", "Delayed alert") }));
    view.rerender(route("Dashboard", "staff-alert-new"));
    await act(async () => finishReady(registration));
    expect(showNotification).not.toHaveBeenCalled();

    await act(async () => state.insert.get("notifications-staff-alert-new")?.({ new: notice("new", "Active account alert") }));
    expect(showNotification).toHaveBeenCalledExactlyOnceWith("Active account alert", expect.objectContaining({ body: "Task updated" }));
  });
});

describe("phone alert restoration", () => {
  it("reattaches an existing subscription to the signed-in user without requesting permission again", async () => {
    const subscription = { endpoint: "https://push.example/device", keys: { p256dh: "key", auth: "auth" } };
    const getSubscription = vi.fn().mockResolvedValue(subscription);
    const requestPermission = vi.fn();
    const registration = { active: { scriptURL: new URL("/sw.js", window.location.origin).href }, pushManager: { getSubscription } };
    const register = vi.fn().mockResolvedValue(registration);
    const getRegistration = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValue(registration);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("Notification", { permission: "granted", requestPermission });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration, register } });

    const view = render(<NotificationBell userId="staff-1"/>);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));

    await waitFor(() => expect(screen.getByText("Phone alerts active on this device.")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/push/subscribe", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription),
    });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Enable phone alerts|Set up phone alerts/ })).not.toBeInTheDocument();
    view.unmount();
    render(<NotificationBell userId="staff-1"/>);
    await waitFor(() => expect(getSubscription).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("automatically recreates a missing subscription when permission is already granted", async () => {
    const subscription = { endpoint: "https://push.example/recovered" };
    const subscribe = vi.fn().mockResolvedValue(subscription);
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { permission: "granted", requestPermission });
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: "YWJj" }) }).mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true, value: { getRegistration: vi.fn().mockResolvedValue(undefined), register: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe } }) },
    });
    render(<NotificationBell userId="staff-2"/>);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    await waitFor(() => expect(screen.getByText("Phone alerts active on this device.")).toBeInTheDocument());
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/push/subscribe", expect.objectContaining({ method: "POST", body: JSON.stringify(subscription) }));
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("does not request permission or subscribe automatically before consent", async () => {
    const requestPermission = vi.fn();
    const getSubscription = vi.fn();
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: vi.fn().mockResolvedValue(undefined), register: vi.fn().mockResolvedValue({ pushManager: { getSubscription } }) } });
    render(<NotificationBell userId="staff-3"/>);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Enable phone alerts" })).toBeInTheDocument());
    expect(requestPermission).not.toHaveBeenCalled();
    expect(getSubscription).not.toHaveBeenCalled();
  });
});
