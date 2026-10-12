import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "./notification-bell";

const removeChannel = vi.fn().mockResolvedValue(undefined);
const state = vi.hoisted(() => ({
  items: [] as Array<{id:string;title:string;body:string;href:string;created_at:string;read_at:null}>,
  update: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: state.items }) }) }) }),
      update: () => ({ in: () => ({ eq: (...args: unknown[]) => state.update(...args) }) }),
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel,
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  state.items = [];
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
});

describe("phone alert restoration", () => {
  it("reattaches an existing subscription to the signed-in user without requesting permission again", async () => {
    const subscription = { endpoint: "https://push.example/device", keys: { p256dh: "key", auth: "auth" } };
    const getSubscription = vi.fn().mockResolvedValue(subscription);
    const requestPermission = vi.fn();
    const register = vi.fn().mockResolvedValue({ pushManager: { getSubscription } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("Notification", { permission: "granted", requestPermission });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });

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
  });

  it("automatically recreates a missing subscription when permission is already granted", async () => {
    const subscription = { endpoint: "https://push.example/recovered" };
    const subscribe = vi.fn().mockResolvedValue(subscription);
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { permission: "granted", requestPermission });
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: "YWJj" }) }).mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true, value: { register: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe } }) },
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
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register: vi.fn().mockResolvedValue({ pushManager: { getSubscription } }) } });
    render(<NotificationBell userId="staff-3"/>);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Enable phone alerts" })).toBeInTheDocument());
    expect(requestPermission).not.toHaveBeenCalled();
    expect(getSubscription).not.toHaveBeenCalled();
  });
});
