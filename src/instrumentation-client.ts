// Only retry page reads. Some other dashboard GETs initialize registers, create
// recurring tasks, send queued mail, or return an attachment.
const readOnlyPages = new Set([
  "/account", "/office-inventory", "/documents", "/documents/quotations", "/documents/purchase-orders",
  "/documents/check-out-batches", "/documents/deposit-receipts", "/documents/payment-vouchers",
  "/documents/receipts", "/documents/suppliers", "/documents/unifi-receipts",
  "/admin/calendar", "/admin/checkouts", "/admin/checkouts/batches",
  "/admin/checkouts/inspection", "/admin/checkouts/occupancy-report", "/admin/checkouts/painting",
  "/admin/checkouts/pending-material", "/admin/checkouts/status-report", "/admin/complaints",
  "/admin/complaints/new", "/admin/inventory", "/admin/inventory/purchase-orders", "/admin/jobs",
  "/admin/material-requests", "/admin/notifications", "/admin/reports", "/admin/settings",
  "/admin/users", "/admin/unifi-invoices", "/admin/cert-servicing/certificates",
  "/admin/cert-servicing/servicing", "/admin/cert-servicing/agreements",
  "/staff/appointments", "/staff/calendar", "/staff/checkouts", "/staff/checkouts/assign",
  "/staff/complaints", "/staff/complaints/new", "/staff/material-request", "/staff/monitoring", "/staff/tasks",
]);
const recordPage = /^\/(?:admin\/(?:complaints|jobs|checkouts(?:\/batches)?|cert-servicing\/records|unifi-invoices|document-review\/(?:billing|gym))|staff\/(?:jobs|checkouts|daily-tasks))\/(?:[0-9]+|[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12})$/i;
const billingFolder = /^\/documents\/billing\/(?:rental|utility)(?:\/account-[^/]+)?$/;
const supplierFolder = /^\/documents\/suppliers\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

function canRetry(pathname: string) {
  return readOnlyPages.has(pathname) || recordPage.test(pathname) || billingFolder.test(pathname) || supplierFolder.test(pathname);
}

let click: { event: MouseEvent; anchor: HTMLAnchorElement } | null = null;
let pending: { destination: string; timer: number; anchor: HTMLAnchorElement } | null = null;

function cancel() {
  if (pending) {
    window.clearTimeout(pending.timer);
    pending.anchor.removeAttribute("data-opening-page");
    pending = null;
  }
}

document.addEventListener("click", event => {
  click = null;
  if (event.button !== 0 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement)) { cancel(); return; }
  if ((anchor.target && anchor.target.toLowerCase() !== "_self") || anchor.hasAttribute("download")) return;
  if (anchor.href !== pending?.destination) cancel();
  click = { event, anchor };
  window.setTimeout(() => { if (click?.event === event) click = null; }, 0);
}, true);

for (const event of ["submit", "input", "visibilitychange"]) document.addEventListener(event, cancel, true);
for (const event of ["pagehide", "popstate", "hashchange"]) window.addEventListener(event, cancel);
document.addEventListener("keydown", event => { if (event.key === "Escape") cancel(); });

// Next calls this hook synchronously after a Link's click and onNavigate guards
// have accepted the transition. Native anchors, prefetch and refresh never arm it.
export function onRouterTransitionStart(href: string, type: "push" | "replace" | "traverse") {
  const intent = click;
  click = null;
  if (type === "traverse" || !intent || intent.event.eventPhase === Event.NONE || document.visibilityState !== "visible") {
    cancel();
    return;
  }
  const origin = window.location.href;
  const url = new URL(href, origin);
  if (url.href !== intent.anchor.href || url.origin !== window.location.origin || url.pathname === window.location.pathname || !canRetry(url.pathname)) {
    cancel();
    return;
  }
  if (pending?.destination === url.href) return;
  cancel();
  const anchor = intent.anchor;
  anchor.setAttribute("data-opening-page", "");
  const timer = window.setTimeout(() => {
    cancel();
    if (window.location.href !== origin || document.visibilityState !== "visible") return;
    if (type === "replace") window.location.replace(url.href);
    else window.location.assign(url.href);
  }, 1500);
  pending = { destination: url.href, anchor, timer };
}
