import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
import type { Profile } from "@/lib/types";

vi.mock("./notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("./logout-form", () => ({ LogoutForm: () => null }));
vi.mock("./shell-navigation", async importOriginal => ({
  ...await importOriginal<typeof import("./shell-navigation")>(),
  ShellLink: (props: ComponentProps<"a">) => <a {...props} data-client-navigation />,
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

it("uses direct same-tab links for the Work Management and Daily Tasks entries in both menus", () => {
  render(<AppShell profile={profile} title="New Complaints">Page</AppShell>);
  const menus = screen.getAllByRole("navigation", { name: "Main navigation", hidden: true });
  expect(menus).toHaveLength(2);
  for (const menu of menus) {
    const links = within(menu).getAllByRole("link", { hidden: true });
    const nativeLinks = links.filter(link => !link.hasAttribute("data-client-navigation"));
    expect(nativeLinks.map(link => [link.textContent, link.getAttribute("href")])).toEqual([...workLinks, ...dailyLinks]);
    for (const link of nativeLinks) {
      expect(link).not.toHaveAttribute("target");
      expect(link).not.toHaveAttribute("download");
    }
    expect(nativeLinks[0]).toHaveAttribute("aria-current", "page");
    expect(links.find(link => link.textContent === "Material Requests")).toHaveAttribute("data-client-navigation");
  }
});

it("keeps Flex hidden in both Work Management menus for management viewers", () => {
  render(<AppShell profile={{ ...profile, role: "management_viewer" }} title="Dashboard">Page</AppShell>);
  const menus = screen.getAllByRole("navigation", { name: "Main navigation", hidden: true });
  expect(menus).toHaveLength(2);
  for (const menu of menus) {
    expect(menu.querySelector('a[href="/flex-inspections"]')).toBeNull();
    const links = menu.querySelectorAll("a.native-menu-link");
    expect(Array.from(links, link => link.textContent)).toEqual(
      [...workLinks, ...dailyLinks].map(([label]) => label).filter(label => label !== "Flex Fire Safety Inspection")
    );
  }
});

it.each(dailyLinks)("marks only %s as current in both Daily Tasks menus", (label, href) => {
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
