import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "./notification-bell";

const removeChannel = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel,
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
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

    render(<NotificationBell userId="staff-1"/>);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));

    await waitFor(() => expect(screen.getByText("Phone alerts active on this device.")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/push/subscribe", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription),
    });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Enable phone alerts|Set up phone alerts/ })).not.toBeInTheDocument();
  });

  it("offers setup when permission exists but the browser subscription is gone", async () => {
    vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn() });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true, value: { register: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null) } }) },
    });

    render(<NotificationBell userId="staff-1"/>);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Set up phone alerts" })).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
