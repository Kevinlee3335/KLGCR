import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
import type { Profile } from "@/lib/types";

vi.mock("./notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("./logout-form", () => ({ LogoutForm: () => null }));
vi.mock("next/link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} data-client-navigation />,
}));

const profile: Profile = { id: "admin", username: "admin", full_name: "Admin", role: "admin", is_active: true };
const workLinks = [
  ["New Complaints", "/admin/complaints"],
  ["Maintenance Jobs", "/admin/jobs"],
  ["Check-out Rooms", "/admin/checkouts"],
  ["Flex Fire Safety Inspection", "/flex-inspections"],
  ["Waste Collection", "/admin/waste-collection"],
];

const dailyLinks = [
  ["All Daily Tasks", "/admin/daily-tasks"],
  ["Admin Task", "/admin/daily-tasks?category=admin"],
  ["Operation Task", "/admin/daily-tasks?category=operation"],
  ["Housekeeping Task", "/admin/daily-tasks?category=housekeeping"],
];

const inventoryLinks = [
  ["Building Material", "/admin/inventory?store=building"],
  ["Office Inventory", "/admin/inventory?store=office"],
  ["Cleaner Supplies", "/admin/inventory?store=cleaner"],
  ["Material Requests", "/admin/material-requests"],
];
const quotationLinks = [
  ["Quotations", "/admin/quotations"],
  ["Purchase Orders", "/admin/inventory/purchase-orders"],
];
const documentLinks = [
  ["Documents", "/documents"],
  ["Reports", "/admin/reports"],
  ["Cert & Servicing", "/admin/cert-servicing/certificates"],
  ["TM Unifi Invoices", "/admin/unifi-invoices"],
];
const systemLinks = [["Notifications", "/admin/notifications"], ["Users", "/admin/users"], ["Settings", "/admin/settings"]];
const submenuLinks = [...workLinks, ...dailyLinks, ...inventoryLinks, ...quotationLinks, ...documentLinks, ...systemLinks];
const rentalLinks = [["Billing Overview", "/admin/billing"], ["Payment Verification", "/admin/payment-verification"]];

it("uses direct same-tab links for the configured desktop and mobile submenu destinations", () => {
  render(<AppShell profile={profile} title="New Complaints">Page</AppShell>);
  const menus = screen.getAllByRole("navigation", { name: "Main navigation", hidden: true });
  expect(menus).toHaveLength(2);
  for (const menu of menus) {
    const links = within(menu).getAllByRole("link", { hidden: true });
    const submenu = menu.querySelectorAll("a.native-menu-link");
    expect(Array.from(submenu, link => [link.textContent, link.getAttribute("href")])).toEqual([...submenuLinks, ...rentalLinks]);
    for (const link of links) {
      expect(link).not.toHaveAttribute("data-client-navigation");
      expect(link).not.toHaveAttribute("target");
      expect(link).not.toHaveAttribute("download");
    }
    expect(submenu[0]).toHaveAttribute("aria-current", "page");
  }
});

it("keeps Flex inspections and TM Unifi invoices hidden in both menus for management viewers", () => {
  render(<AppShell profile={{ ...profile, role: "management_viewer" }} title="Dashboard">Page</AppShell>);
  const menus = screen.getAllByRole("navigation", { name: "Main navigation", hidden: true });
  expect(menus).toHaveLength(2);
  for (const menu of menus) {
    expect(menu.querySelector('a[href="/flex-inspections"]')).toBeNull();
    expect(menu.querySelector('a[href="/admin/unifi-invoices"]')).toBeNull();
    const links = menu.querySelectorAll("a.native-menu-link");
    expect(Array.from(links, link => [link.textContent, link.getAttribute("href")])).toEqual(
      submenuLinks.filter(([label]) => label !== "Flex Fire Safety Inspection" && label !== "TM Unifi Invoices")
    );
  }
});

it.each([...dailyLinks, ...inventoryLinks, ...quotationLinks, ...documentLinks, ...systemLinks])("marks only %s as current in both menus", (label, href) => {
  const title = label === "All Daily Tasks" ? "Daily Tasks" : label;
  render(<AppShell profile={profile} title={title}>Page</AppShell>);

  for (const menu of screen.getAllByRole("navigation", { name: "Main navigation", hidden: true })) {
    const active = menu.querySelectorAll('a[aria-current="page"]');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent(label);
    expect(active[0]).toHaveAttribute("href", href);
    expect(active[0].closest(".admin-nav-group")).toHaveClass("is-active");
  }
});

it.each(["maintenance_staff", "cleaner"] as const)("opens Documents directly for %s", role => {
  render(<AppShell profile={{ ...profile, role }} title="Documents">Page</AppShell>);
  for (const menu of screen.getAllByRole("navigation", { name: "Main navigation", hidden: true })) {
    const documents = menu.querySelector('a[href="/documents"]');
    expect(documents).not.toHaveAttribute("data-client-navigation");
    expect(documents).toHaveAttribute("aria-current", "page");
    expect(menu.querySelector('a[href^="/admin/"]')).toBeNull();
  }
});

it("opens the account and all maintenance staff Material Request links directly", () => {
  const { container } = render(<AppShell profile={{ ...profile, role: "maintenance_staff" }} title="Material Request">Page</AppShell>);
  const materialLinks = container.querySelectorAll('a[href="/staff/material-request"]');
  expect(materialLinks).toHaveLength(3);
  for (const link of materialLinks) expect(link).not.toHaveAttribute("data-client-navigation");
  expect(screen.getByRole("link", { name: "Change Password" })).toHaveAttribute("href", "/account");
  expect(container.querySelector('a[href="/admin/material-requests"]')).toBeNull();
});
