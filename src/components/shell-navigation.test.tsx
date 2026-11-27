import Link from "next/link";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileNavigationDrawer, ShellLink } from "./shell-navigation";

const linkStatus = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/link")>(),
  useLinkStatus: () => linkStatus,
}));

it("closes the mobile drawer from its backdrop and Escape, then returns focus to the menu", () => {
  const { container } = render(<MobileNavigationDrawer><a href="/admin">Dashboard</a></MobileNavigationDrawer>);
  const drawer = container.querySelector("details");
  const menu = screen.getByLabelText("Navigation menu");

  fireEvent.click(menu);
  expect(drawer).toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button", { name: "Close navigation menu" }));
  expect(drawer).not.toHaveAttribute("open");
  expect(menu).toHaveFocus();

  fireEvent.click(menu);
  const link = screen.getByRole("link", { name: "Dashboard" });
  link.focus();
  fireEvent.keyDown(link, { key: "Escape" });
  expect(drawer).not.toHaveAttribute("open");
  expect(menu).toHaveFocus();
});

describe("recovery for stalled material request and Work Management navigation", () => {
  const assign = vi.fn();
  const replace = vi.fn();
  let current: URL;

  beforeEach(() => {
    vi.useFakeTimers();
    linkStatus.pending = true;
    assign.mockReset();
    replace.mockReset();
    current = new URL("/admin", window.location.origin);
    const location = {
      get href() { return current.href; },
      get pathname() { return current.pathname; },
      get origin() { return current.origin; },
      assign, replace,
    };
    vi.stubGlobal("window", new Proxy(window, {
      get: (target, key) => key === "location" ? location : Reflect.get(target, key),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    linkStatus.pending = false;
  });

  it.each(["/admin/material-requests?status=pending#requests", "/staff/material-request"])(
    "opens the exact destination %s once after three seconds of pending navigation", href => {
      render(<ShellLink href={href}>Materials</ShellLink>);
      expect(screen.getByRole("status", { name: "Loading page" })).toBeInTheDocument();
      vi.advanceTimersByTime(2999);
      expect(assign).not.toHaveBeenCalled();
      vi.advanceTimersByTime(3001);
      expect(assign.mock.calls).toEqual([[new URL(href, current).href]]);
    }
  );

  it.each(["/admin/complaints", "/admin/jobs", "/admin/checkouts", "/flex-inspections", "/admin/waste-collection"])(
    "recovers the Work Management menu link for %s", href => {
      render(<ShellLink href={href} recoverStalledNavigation>Open page</ShellLink>);
      vi.advanceTimersByTime(2999);
      expect(assign).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(assign.mock.calls).toEqual([[new URL(href, current).href]]);
    }
  );

  it("keeps the link's replace semantics", () => {
    render(<ShellLink href="/staff/material-request" replace>Materials</ShellLink>);
    vi.advanceTimersByTime(3000);
    expect(replace).toHaveBeenCalledWith(new URL("/staff/material-request", current).href);
    expect(assign).not.toHaveBeenCalled();
  });

  it.each(["/admin/jobs", "/admin/material-requests/action", "https://example.com/admin/material-requests"])(
    "does not apply to %s", href => {
      render(<ShellLink href={href}>Link</ShellLink>);
      vi.advanceTimersByTime(4000);
      expect(assign).not.toHaveBeenCalled();
    }
  );

  it.each(["/admin/material-requests?status=approved", "/admin/jobs"])(
    "keeps the current page when navigation already committed to %s", url => {
      render(<ShellLink href="/admin/material-requests">Materials</ShellLink>);
      current = new URL(url, current);
      vi.advanceTimersByTime(4000);
      expect(assign).not.toHaveBeenCalled();
    }
  );

  it("does not arm on same-page filters or if the link never enters a pending transition", () => {
    current = new URL("/admin/material-requests", current);
    const link = render(<ShellLink href="/admin/material-requests?status=pending">Pending</ShellLink>);
    vi.advanceTimersByTime(3000);
    current = new URL("/admin", current);
    linkStatus.pending = false;
    link.rerender(<ShellLink href="/admin/material-requests">Materials</ShellLink>);
    vi.advanceTimersByTime(3000);
    expect(assign).not.toHaveBeenCalled();
  });

  it.each(["superseding link", "submit", "popstate", "hashchange", "background", "pagehide", "unmount", "settled"])(
    "cancels the timer after %s", action => {
      const rendered = render(<><ShellLink href="/admin/material-requests">Materials</ShellLink>
        <Link href="/admin/jobs" onClick={e => e.preventDefault()}>Jobs</Link><form data-testid="form"/></>);
      vi.advanceTimersByTime(2000);
      switch (action) {
        case "superseding link": fireEvent.click(screen.getByText("Jobs")); break;
        case "submit": fireEvent.submit(screen.getByTestId("form")); break;
        case "popstate": window.dispatchEvent(new Event("popstate")); break;
        case "hashchange": window.dispatchEvent(new Event("hashchange")); break;
        case "background": document.dispatchEvent(new Event("visibilitychange")); break;
        case "pagehide": window.dispatchEvent(new Event("pagehide")); break;
        case "unmount": rendered.unmount(); break;
        case "settled":
          linkStatus.pending = false;
          rendered.rerender(<ShellLink href="/admin/material-requests">Materials</ShellLink>);
          break;
      }
      vi.advanceTimersByTime(2000);
      expect(assign).not.toHaveBeenCalled();
    }
  );

  it("keeps the timeout when the user taps the same destination twice", () => {
    render(<ShellLink onClick={event => event.preventDefault()} href="/admin/material-requests">Materials</ShellLink>);
    vi.advanceTimersByTime(2000);
    fireEvent.click(screen.getByRole("link", { name: /Materials/ }));
    vi.advanceTimersByTime(1000);
    expect(assign).toHaveBeenCalledOnce();
  });

  it("leaves ordinary navigation untouched when another link is opened in a new tab", () => {
    render(<><ShellLink href="/admin/material-requests">Materials</ShellLink>
      <Link href="/admin/jobs" onClick={e => e.preventDefault()}>Jobs</Link></>);
    fireEvent.click(screen.getByText("Jobs"), { ctrlKey: true });
    vi.advanceTimersByTime(3000);
    expect(assign).toHaveBeenCalledOnce();
  });
});
