import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { onRouterTransitionStart } from "./instrumentation-client";

const assign = vi.fn(), replace = vi.fn();
let current: URL;

beforeEach(() => {
  vi.useFakeTimers();
  current = new URL("/admin", window.location.origin);
  assign.mockClear();
  replace.mockClear();
  const location = {
    get href() { return current.href; }, get origin() { return current.origin; },
    get pathname() { return current.pathname; }, assign, replace,
  };
  vi.stubGlobal("window", new Proxy(window, {
    get: (target, key) => key === "location" ? location : Reflect.get(target, key),
  }));
});
afterEach(() => {
  document.dispatchEvent(new Event("visibilitychange"));
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function linkClick(href: string, { type = "push", accepted = true, target = "", download = false, modifiers = {} }: {
  type?: "push" | "replace"; accepted?: boolean; target?: string; download?: boolean; modifiers?: MouseEventInit;
} = {}) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.target = target;
  if (download) anchor.download = "report";
  document.body.appendChild(anchor);
  anchor.addEventListener("click", event => {
    event.preventDefault();
    if (accepted) onRouterTransitionStart(href, type);
  });
  anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...modifiers }));
  return anchor;
}

it.each(["push", "replace"] as const)("recovers an accepted %s with the exact query and fragment only once", type => {
  const href = "/admin/jobs/123?from=reports#detail";
  const anchor = linkClick(href, { type });
  expect(anchor).toHaveAttribute("data-opening-page");
  vi.advanceTimersByTime(1200);
  expect(assign).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  linkClick(href, { type });
  vi.advanceTimersByTime(4000);
  expect(type === "push" ? assign.mock.calls : replace.mock.calls).toEqual([[new URL(href, current).href]]);
  expect(type === "push" ? replace : assign).not.toHaveBeenCalled();
  expect(anchor).not.toHaveAttribute("data-opening-page");
});

it.each([
  ["/admin/jobs", { accepted: false }], ["/admin/jobs", { target: "_blank" }], ["/admin/jobs", { download: true }],
  ["/admin/jobs", { modifiers: { ctrlKey: true } }], ["/admin/jobs", { modifiers: { metaKey: true } }],
  ["/admin/jobs", { modifiers: { shiftKey: true } }], ["/admin/jobs", { modifiers: { altKey: true } }],
  ["/admin/jobs", { modifiers: { button: 1 } }], ["#summary", {}], ["/admin?tab=summary", {}],
  ["/admin/members", {}], ["/admin/quotations", {}], ["/admin/billing", {}], ["/documents/utility-readings", {}],
  ["/documents/suppliers/vendor/emails/abcdef1234", {}], ["/api/logout", {}], ["/staff/material-request/submit", {}],
  ["/admin/reports/export", {}], ["/admin/members/export", {}], ["https://different.example/admin/jobs", {}],
] as const)("does not retry %s %j", (href, options) => {
  linkClick(href, options);
  vi.advanceTimersByTime(2000);
  expect(assign).not.toHaveBeenCalled();
});

it.each(["/documents/billing/utility/account-Block%20A", "/documents/suppliers/vendor-one",
  "/admin/document-review/gym/12345678-abcd-4321-abcd-123456789012"])("recovers the read-only archive or review %s", href => {
  linkClick(href);
  vi.advanceTimersByTime(1500);
  expect(assign).toHaveBeenCalledWith(new URL(href, current).href);
});

it("does not retry dashboard entry work", () => {
  current = new URL("/admin/jobs", current);
  linkClick("/admin");
  vi.advanceTimersByTime(2000);
  expect(assign).not.toHaveBeenCalled();
});

it.each(["new link", "button", "input", "submit", "visibilitychange", "pagehide", "hashchange", "popstate", "Escape", "traverse", "commit"])(
  "cancels a previous intent on %s", event => {
    linkClick("/admin/jobs");
    if (event === "new link") linkClick("/admin/material-requests", { accepted: false });
    else if (event === "button") document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    else if (event === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    else if (event === "traverse") onRouterTransitionStart("/admin/jobs", "traverse");
    else if (event === "commit") current = new URL("/admin/jobs", current);
    else if (["input", "submit", "visibilitychange"].includes(event)) document.dispatchEvent(new Event(event));
    else window.dispatchEvent(new Event(event));
    vi.advanceTimersByTime(2200);
    expect(assign).not.toHaveBeenCalled();
  }
);

it("requires the router to accept the same destination during the original click", () => {
  linkClick("/admin/jobs", { accepted: false });
  onRouterTransitionStart("/admin/jobs", "push");
  onRouterTransitionStart("/staff/material-request", "push");
  vi.advanceTimersByTime(2000);
  expect(assign).not.toHaveBeenCalled();
});
